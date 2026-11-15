-- Core tenancy: profiles, organizations, memberships, invitations.
--
-- Rules of this schema:
--   * Every tenant table has row level security enabled. A user only sees rows
--     of organizations they are an active member of.
--   * Writes that carry business rules (creating an organization, inviting,
--     changing roles, removing members) go through SECURITY DEFINER functions,
--     so each rule lives in exactly one place and cannot be bypassed by a
--     direct insert/update from the client.
--   * Helper functions used inside policies live in the `private` schema, which
--     is not exposed through the API.
--   * Functions raise exceptions whose message is a stable machine-readable
--     code (e.g. 'last_owner'); the application maps it to a translated text.

create schema if not exists private;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type public.organization_type as enum ('clinic', 'individual');
create type public.member_role as enum ('owner', 'admin', 'vet', 'assistant', 'receptionist');
create type public.member_status as enum ('active', 'suspended');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function private.hash_token(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
$$;

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 200),
  title text check (title is null or char_length(title) <= 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 200));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Organizations (tenants): a clinic or an individual veterinarian
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  type public.organization_type not null,
  name text not null check (char_length(name) between 1 and 200),
  tax_number text check (tax_number is null or char_length(tax_number) between 1 and 50),
  country text not null default 'HU' check (char_length(country) = 2),
  postal_code text check (postal_code is null or char_length(postal_code) <= 20),
  city text check (city is null or char_length(city) <= 100),
  address_line text check (address_line is null or char_length(address_line) <= 200),
  phone text check (phone is null or char_length(phone) <= 50),
  email text check (email is null or char_length(email) <= 320),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A clinic is invoiced as a business, so its tax number is mandatory.
  constraint clinic_requires_tax_number check (type <> 'clinic' or tax_number is not null)
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Memberships (user ↔ organization, with role)
-- ---------------------------------------------------------------------------

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  -- "Clinical authority": may finalise and reopen treatment records.
  -- Always true for vets; optional for owners; never for other roles.
  is_clinician boolean not null default false,
  status public.member_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  constraint vet_is_clinician check (role <> 'vet' or is_clinician),
  constraint clinician_role check (not is_clinician or role in ('owner', 'vet'))
);

create index memberships_user_id_idx on public.memberships (user_id);

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 320),
  role public.member_role not null check (role <> 'owner'),
  -- Only the hash is stored; the token itself exists only in the invitation link.
  token_hash text not null unique,
  invited_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index invitations_organization_id_idx on public.invitations (organization_id);
create index invitations_email_idx on public.invitations (email);

-- ---------------------------------------------------------------------------
-- Policy helpers (private schema, SECURITY DEFINER so they can read
-- memberships without recursing into its own policies)
-- ---------------------------------------------------------------------------

create function private.my_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.status = 'active';
$$;

create function private.my_managed_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and m.role in ('owner', 'admin');
$$;

create function private.my_colleague_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select other.user_id
  from public.memberships mine
  join public.memberships other on other.organization_id = mine.organization_id
  where mine.user_id = (select auth.uid())
    and mine.status = 'active';
$$;

create function private.lock_and_count_active_owners(p_organization_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- Lock the owner rows so two concurrent demotions cannot both succeed.
  perform 1
  from public.memberships m
  where m.organization_id = p_organization_id and m.role = 'owner'
  for update;

  select count(*) into v_count
  from public.memberships m
  where m.organization_id = p_organization_id
    and m.role = 'owner'
    and m.status = 'active';

  return v_count;
end;
$$;

revoke execute on function private.set_updated_at() from public;
revoke execute on function private.handle_new_user() from public;
revoke execute on function private.hash_token(text) from public;
revoke execute on function private.lock_and_count_active_owners(uuid) from public;
revoke execute on function private.my_organization_ids() from public;
revoke execute on function private.my_managed_organization_ids() from public;
revoke execute on function private.my_colleague_ids() from public;
grant execute on function private.my_organization_ids() to authenticated;
grant execute on function private.my_managed_organization_ids() to authenticated;
grant execute on function private.my_colleague_ids() to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security and grants
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.organizations from anon, authenticated;
revoke all on table public.memberships from anon, authenticated;
revoke all on table public.invitations from anon, authenticated;

grant all on table public.profiles to service_role;
grant all on table public.organizations to service_role;
grant all on table public.memberships to service_role;
grant all on table public.invitations to service_role;

-- profiles: read your own and your colleagues'; edit only your own name and title.
grant select on table public.profiles to authenticated;
grant update (full_name, title) on table public.profiles to authenticated;

create policy "profiles: read own and colleagues"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or id in (select private.my_colleague_ids()));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- organizations: members read; owners and admins edit contact and billing
-- details. Type changes and creation go through functions.
grant select on table public.organizations to authenticated;
grant update (name, tax_number, country, postal_code, city, address_line, phone, email)
  on table public.organizations to authenticated;

create policy "organizations: members read"
  on public.organizations for select to authenticated
  using (id in (select private.my_organization_ids()));

create policy "organizations: owners and admins update"
  on public.organizations for update to authenticated
  using (id in (select private.my_managed_organization_ids()))
  with check (id in (select private.my_managed_organization_ids()));

-- memberships: read-only for members (and always your own rows, so a
-- suspended user can see why access is gone). All changes go through functions.
grant select on table public.memberships to authenticated;

create policy "memberships: read own organization"
  on public.memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or organization_id in (select private.my_organization_ids())
  );

-- invitations: owners and admins can list them; the token hash is never exposed.
grant select (id, organization_id, email, role, invited_by, expires_at, accepted_at, revoked_at, created_at)
  on table public.invitations to authenticated;

create policy "invitations: owners and admins read"
  on public.invitations for select to authenticated
  using (organization_id in (select private.my_managed_organization_ids()));

-- ---------------------------------------------------------------------------
-- Functions callable through the API (business rules)
-- ---------------------------------------------------------------------------

-- Creates an organization and makes the caller its owner, atomically.
create function public.create_organization(
  p_type public.organization_type,
  p_name text,
  p_tax_number text default null,
  p_country text default 'HU',
  p_postal_code text default null,
  p_city text default null,
  p_address_line text default null,
  p_phone text default null,
  p_email text default null,
  p_owner_is_clinician boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_type = 'individual' and exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = v_user and m.role = 'owner' and o.type = 'individual'
  ) then
    raise exception 'individual_account_exists';
  end if;

  if (select count(*) from public.memberships m where m.user_id = v_user and m.role = 'owner') >= 5 then
    raise exception 'organization_limit_reached';
  end if;

  insert into public.organizations (
    type, name, tax_number, country, postal_code, city, address_line, phone, email, created_by
  )
  values (
    p_type,
    btrim(p_name),
    nullif(btrim(p_tax_number), ''),
    upper(coalesce(nullif(btrim(p_country), ''), 'HU')),
    nullif(btrim(p_postal_code), ''),
    nullif(btrim(p_city), ''),
    nullif(btrim(p_address_line), ''),
    nullif(btrim(p_phone), ''),
    nullif(lower(btrim(p_email)), ''),
    v_user
  )
  returning id into v_org;

  insert into public.memberships (organization_id, user_id, role, is_clinician)
  values (v_org, v_user, 'owner', p_type = 'individual' or coalesce(p_owner_is_clinician, false));

  return v_org;
end;
$$;

-- Creates (or replaces) a pending invitation and returns the one-time token.
create function public.create_invitation(
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
  v_user uuid := auth.uid();
  v_email text := lower(btrim(p_email));
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.memberships m
    where m.organization_id = p_organization_id
      and m.user_id = v_user
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

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

  -- A new invitation replaces any pending one for the same address.
  update public.invitations i
  set revoked_at = now()
  where i.organization_id = p_organization_id
    and i.email = v_email
    and i.accepted_at is null
    and i.revoked_at is null;

  insert into public.invitations (organization_id, email, role, token_hash, invited_by, expires_at)
  values (p_organization_id, v_email, p_role, private.hash_token(v_token), v_user, now() + interval '7 days')
  returning id into v_id;

  return query select v_id, v_token;
end;
$$;

create function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update public.invitations i
  set revoked_at = now()
  where i.id = p_invitation_id
    and i.accepted_at is null
    and i.revoked_at is null
    and exists (
      select 1 from public.memberships m
      where m.organization_id = i.organization_id
        and m.user_id = v_user
        and m.status = 'active'
        and m.role in ('owner', 'admin')
    );

  if not found then
    raise exception 'invitation_not_found';
  end if;
end;
$$;

-- What the invitation page shows before the invitee signs in. Knowing the
-- token is the authorisation; nothing beyond the organization name leaks.
create function public.get_invitation(p_token text)
returns table (organization_name text, email text, role public.member_role, state text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.name,
    i.email,
    i.role,
    case
      when i.accepted_at is not null then 'accepted'
      when i.revoked_at is not null then 'revoked'
      when i.expires_at < now() then 'expired'
      else 'pending'
    end
  from public.invitations i
  join public.organizations o on o.id = i.organization_id
  where i.token_hash = private.hash_token(p_token);
$$;

create function public.accept_invitation(p_token text)
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

  insert into public.memberships (organization_id, user_id, role, is_clinician)
  values (v_inv.organization_id, v_user, v_inv.role, v_inv.role = 'vet');

  update public.invitations i
  set accepted_at = now(), accepted_by = v_user
  where i.id = v_inv.id;

  return v_inv.organization_id;
end;
$$;

-- Changes a member's role. Only owners may touch owners or grant ownership;
-- the last active owner can never be demoted.
create function public.update_member(
  p_membership_id uuid,
  p_role public.member_role,
  p_is_clinician boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_target public.memberships%rowtype;
  v_actor_role public.member_role;
  v_org_type public.organization_type;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_target from public.memberships m where m.id = p_membership_id for update;
  if not found then
    raise exception 'member_not_found';
  end if;

  select m.role into v_actor_role
  from public.memberships m
  where m.organization_id = v_target.organization_id
    and m.user_id = v_user
    and m.status = 'active';

  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if (v_target.role = 'owner' or p_role = 'owner') and v_actor_role <> 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_target.role = 'owner' and p_role <> 'owner'
     and private.lock_and_count_active_owners(v_target.organization_id) <= 1 then
    raise exception 'last_owner';
  end if;

  select o.type into v_org_type from public.organizations o where o.id = v_target.organization_id;

  update public.memberships m
  set
    role = p_role,
    is_clinician = case
      when p_role = 'vet' then true
      when p_role = 'owner' then v_org_type = 'individual' or coalesce(p_is_clinician, false)
      else false
    end
  where m.id = p_membership_id;
end;
$$;

create function public.set_member_status(p_membership_id uuid, p_status public.member_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_target public.memberships%rowtype;
  v_actor_role public.member_role;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_target from public.memberships m where m.id = p_membership_id for update;
  if not found then
    raise exception 'member_not_found';
  end if;

  select m.role into v_actor_role
  from public.memberships m
  where m.organization_id = v_target.organization_id
    and m.user_id = v_user
    and m.status = 'active';

  if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_target.role = 'owner' and v_actor_role <> 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status = 'suspended' and v_target.role = 'owner' and v_target.status = 'active'
     and private.lock_and_count_active_owners(v_target.organization_id) <= 1 then
    raise exception 'last_owner';
  end if;

  update public.memberships m set status = p_status where m.id = p_membership_id;
end;
$$;

-- Removes a member (or lets a member leave). Clinical data they recorded stays.
create function public.remove_member(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_target public.memberships%rowtype;
  v_actor_role public.member_role;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_target from public.memberships m where m.id = p_membership_id for update;
  if not found then
    raise exception 'member_not_found';
  end if;

  select m.role into v_actor_role
  from public.memberships m
  where m.organization_id = v_target.organization_id
    and m.user_id = v_user
    and m.status = 'active';

  if v_target.user_id <> v_user then
    if v_actor_role is null or v_actor_role not in ('owner', 'admin') then
      raise exception 'forbidden' using errcode = '42501';
    end if;
    if v_target.role = 'owner' and v_actor_role <> 'owner' then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  if v_target.role = 'owner' and v_target.status = 'active'
     and private.lock_and_count_active_owners(v_target.organization_id) <= 1 then
    raise exception 'last_owner';
  end if;

  delete from public.memberships m where m.id = p_membership_id;
end;
$$;

-- Only signed-in users may call the functions; the invitation preview is the
-- one exception, because the invitee may not have an account yet.
revoke execute on function public.create_organization(public.organization_type, text, text, text, text, text, text, text, text, boolean) from public, anon;
revoke execute on function public.create_invitation(uuid, text, public.member_role) from public, anon;
revoke execute on function public.revoke_invitation(uuid) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
revoke execute on function public.update_member(uuid, public.member_role, boolean) from public, anon;
revoke execute on function public.set_member_status(uuid, public.member_status) from public, anon;
revoke execute on function public.remove_member(uuid) from public, anon;
revoke execute on function public.get_invitation(text) from public;

grant execute on function public.create_organization(public.organization_type, text, text, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.create_invitation(uuid, text, public.member_role) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.update_member(uuid, public.member_role, boolean) to authenticated;
grant execute on function public.set_member_status(uuid, public.member_status) to authenticated;
grant execute on function public.remove_member(uuid) to authenticated;
grant execute on function public.get_invitation(text) to anon, authenticated;
