-- Plans, subscriptions, trial and entitlements.
--
-- Plans live in the database (name, limits, features, prices), so they can be
-- changed without touching code. Every organization has exactly one
-- subscription row; it starts as a trial when the organization is created.
-- Payment (Stripe) later only changes the subscription's status and dates –
-- what an organization may do is always derived here, in one place.

create type public.plan_audience as enum ('clinic', 'individual');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled');

-- ---------------------------------------------------------------------------
-- Settings and plans
-- ---------------------------------------------------------------------------

-- A single row of billing-wide settings.
create table public.billing_settings (
  id boolean primary key default true check (id),
  trial_days integer not null default 14 check (trial_days between 0 and 365),
  grace_days integer not null default 7 check (grace_days between 0 and 90),
  trial_storage_gb integer not null default 2 check (trial_storage_gb >= 0),
  vat_percent numeric(5, 2) not null default 27 check (vat_percent between 0 and 100),
  prices_include_vat boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.billing_settings default values;

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z_]+$'),
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  audience public.plan_audience not null,
  -- The plan a new organization of this audience starts its trial on.
  is_default boolean not null default false,
  is_public boolean not null default true,
  sort_order integer not null default 0,
  -- NULL means unlimited.
  max_members integer check (max_members is null or max_members >= 1),
  storage_gb integer not null check (storage_gb >= 0),
  features text[] not null default '{}',
  -- Net or gross according to billing_settings.prices_include_vat; NULL = not set yet.
  monthly_price_huf integer check (monthly_price_huf is null or monthly_price_huf >= 0),
  yearly_price_huf integer check (yearly_price_huf is null or yearly_price_huf >= 0),
  stripe_monthly_price_id text,
  stripe_yearly_price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one default plan per audience.
create unique index plans_one_default_per_audience on public.plans (audience) where is_default;

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function private.set_updated_at();

-- Starting values; prices are deliberately not set.
insert into public.plans (key, name, description, audience, is_default, sort_order, max_members, storage_gb, features)
values
  ('individual', 'Egyéni', 'Egyéni állatorvosnak, egyfős fiókkal.', 'individual', true, 10, 1, 10,
    array['templates', 'dictation', 'pdf_branding']),
  ('clinic', 'Rendelő', 'Rendelőnek, munkatársakkal és szerepkörökkel.', 'clinic', true, 20, 10, 100,
    array['templates', 'dictation', 'pdf_branding', 'member_invites', 'audit_export']);

alter table public.billing_settings enable row level security;
alter table public.plans enable row level security;
revoke all on table public.billing_settings from anon, authenticated;
revoke all on table public.plans from anon, authenticated;
grant all on table public.billing_settings to service_role;
grant all on table public.plans to service_role;

-- ---------------------------------------------------------------------------
-- Subscriptions
-- ---------------------------------------------------------------------------

create table public.subscriptions (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  status public.subscription_status not null,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  -- Set when a payment fails; the grace period counts from here.
  past_due_since timestamptz,
  billing_interval text check (billing_interval is null or billing_interval in ('month', 'year')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function private.set_updated_at();

alter table public.subscriptions enable row level security;
revoke all on table public.subscriptions from anon, authenticated;
grant all on table public.subscriptions to service_role;
-- Users never read these tables directly; everything goes through the functions below.

-- Every new organization starts a trial on the default plan of its type.
create function private.start_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan uuid;
  v_days integer;
begin
  select p.id into v_plan from public.plans p where p.audience::text = new.type::text and p.is_default;
  if v_plan is null then
    raise exception 'no_default_plan';
  end if;
  select s.trial_days into v_days from public.billing_settings s;

  insert into public.subscriptions (organization_id, plan_id, status, trial_ends_at)
  values (new.id, v_plan, 'trialing', now() + make_interval(days => v_days));
  return new;
end;
$$;

revoke execute on function private.start_trial() from public;

create trigger organizations_start_trial
  after insert on public.organizations
  for each row execute function private.start_trial();

-- Organizations created before this migration get their trial now.
insert into public.subscriptions (organization_id, plan_id, status, trial_ends_at)
select o.id, p.id, 'trialing', now() + make_interval(days => (select trial_days from public.billing_settings))
from public.organizations o
join public.plans p on p.audience::text = o.type::text and p.is_default
where not exists (select 1 from public.subscriptions s where s.organization_id = o.id);

-- ---------------------------------------------------------------------------
-- What an organization may do
-- ---------------------------------------------------------------------------

-- 'full' or 'read_only'. Read-only: existing data can be viewed and exported,
-- nothing can be added or changed. Data is never deleted because of billing.
create function private.organization_access(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.status = 'active' then 'full'
    when s.status = 'trialing' and s.trial_ends_at > now() then 'full'
    when s.status = 'past_due'
      and s.past_due_since + make_interval(days => (select grace_days from public.billing_settings)) > now()
      then 'full'
    -- Cancelled, but the paid period has not run out yet.
    when s.status = 'canceled' and s.current_period_end > now() then 'full'
    else 'read_only'
  end
  from public.subscriptions s
  where s.organization_id = p_organization_id;
$$;

create function private.require_writable(p_organization_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(private.organization_access(p_organization_id), 'read_only') <> 'full' then
    raise exception 'read_only' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function private.organization_access(uuid) from public;
revoke execute on function private.require_writable(uuid) from public;

-- Plan, status, limits and current usage of an organization, for its members.
create function public.my_entitlements(p_organization_id uuid)
returns table (
  plan_key text,
  plan_name text,
  status public.subscription_status,
  access text,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  grace_ends_at timestamptz,
  max_members integer,
  member_count integer,
  pending_invitation_count integer,
  storage_gb integer,
  features text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.key,
    p.name,
    s.status,
    private.organization_access(p_organization_id),
    s.trial_ends_at,
    s.current_period_end,
    s.cancel_at_period_end,
    s.past_due_since + make_interval(days => (select grace_days from public.billing_settings)),
    p.max_members,
    (select count(*)::integer from public.memberships m where m.organization_id = p_organization_id),
    (select count(*)::integer from public.invitations i
      where i.organization_id = p_organization_id
        and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()),
    case
      when s.status = 'trialing' then least(p.storage_gb, (select trial_storage_gb from public.billing_settings))
      else p.storage_gb
    end,
    p.features
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.organization_id = p_organization_id
    and p_organization_id in (select private.my_organization_ids());
$$;

revoke execute on function public.my_entitlements(uuid) from public, anon;
grant execute on function public.my_entitlements(uuid) to authenticated;

-- The public price list. Stripe identifiers are not exposed.
create function public.list_public_plans()
returns table (
  key text,
  name text,
  description text,
  audience public.plan_audience,
  max_members integer,
  storage_gb integer,
  features text[],
  monthly_price_huf integer,
  yearly_price_huf integer,
  vat_percent numeric,
  prices_include_vat boolean,
  trial_days integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.key, p.name, p.description, p.audience, p.max_members, p.storage_gb, p.features,
    p.monthly_price_huf, p.yearly_price_huf,
    s.vat_percent, s.prices_include_vat, s.trial_days
  from public.plans p
  cross join public.billing_settings s
  where p.is_public
  order by p.sort_order, p.key;
$$;

revoke execute on function public.list_public_plans() from public;
grant execute on function public.list_public_plans() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Limits in the member functions
-- ---------------------------------------------------------------------------

-- Members plus pending invitations may not exceed the plan's limit.
create function private.require_free_seat(p_organization_id uuid, p_counting_invitations boolean)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_max integer;
  v_used integer;
begin
  select p.max_members into v_max
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.organization_id = p_organization_id;

  if v_max is null then
    return;
  end if;

  select count(*) into v_used from public.memberships m where m.organization_id = p_organization_id;
  if p_counting_invitations then
    v_used := v_used + (
      select count(*) from public.invitations i
      where i.organization_id = p_organization_id
        and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    );
  end if;

  if v_used >= v_max then
    raise exception 'seat_limit_reached';
  end if;
end;
$$;

revoke execute on function private.require_free_seat(uuid, boolean) from public;

create or replace function public.create_invitation(
  p_organization_id uuid,
  p_email text,
  p_role public.member_role
)
returns table (invitation_id uuid, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_id uuid;
begin
  perform private.require_permission(p_organization_id, 'members.manage');

  if (select o.type from public.organizations o where o.id = p_organization_id) <> 'clinic' then
    raise exception 'individual_cannot_invite';
  end if;
  if p_role = 'owner' then
    raise exception 'cannot_invite_owner';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email';
  end if;
  if exists (
    select 1
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id and lower(u.email) = v_email
  ) then
    raise exception 'already_member';
  end if;

  perform private.require_writable(p_organization_id);

  -- A new invitation replaces any pending one for the same address …
  update public.invitations i
  set revoked_at = now()
  where i.organization_id = p_organization_id
    and i.email = v_email
    and i.accepted_at is null
    and i.revoked_at is null;

  -- … so the seat check runs after that, and a re-invite never counts twice.
  perform private.require_free_seat(p_organization_id, true);

  insert into public.invitations (organization_id, email, role, token_hash, invited_by, expires_at)
  values (p_organization_id, v_email, p_role, private.hash_token(v_token), auth.uid(), now() + interval '7 days')
  returning id into v_id;

  perform private.audit(p_organization_id, 'invitation.created', 'invitation', v_id::text,
    jsonb_build_object('email', v_email, 'role', p_role));

  return query select v_id, v_token;
end;
$$;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_inv public.invitations%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_user and u.email_confirmed_at is not null;

  if v_email is null then
    raise exception 'email_not_confirmed';
  end if;

  select * into v_inv
  from public.invitations i
  where i.token_hash = private.hash_token(p_token)
  for update;

  if not found then
    raise exception 'invitation_not_found';
  end if;
  if v_inv.accepted_at is not null then
    raise exception 'invitation_already_accepted';
  end if;
  if v_inv.revoked_at is not null then
    raise exception 'invitation_revoked';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'invitation_expired';
  end if;
  if v_inv.email <> v_email then
    raise exception 'invitation_email_mismatch';
  end if;
  if exists (
    select 1 from public.memberships m
    where m.organization_id = v_inv.organization_id and m.user_id = v_user
  ) then
    raise exception 'already_member';
  end if;

  -- The plan may have been downgraded since the invitation was sent.
  perform private.require_writable(v_inv.organization_id);
  perform private.require_free_seat(v_inv.organization_id, false);

  insert into public.memberships (organization_id, user_id, role, is_clinician)
  values (v_inv.organization_id, v_user, v_inv.role, v_inv.role = 'vet');

  update public.invitations i
  set accepted_at = now(), accepted_by = v_user
  where i.id = v_inv.id;

  perform private.audit(v_inv.organization_id, 'invitation.accepted', 'invitation', v_inv.id::text,
    jsonb_build_object('role', v_inv.role));

  return v_inv.organization_id;
end;
$$;
