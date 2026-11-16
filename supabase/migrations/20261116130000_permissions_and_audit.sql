-- Permissions and audit log.
--
-- Permissions: code never asks "is this user an admin?" but "does this user
-- have permission X in this organization?". A role is only a bundle of
-- permission keys (role_permissions). The same table drives the database
-- (policies, functions) and the application, so they cannot drift apart, and
-- custom roles can be added later without touching code.
--
-- Audit log: who did what, when, in which organization. Rows are written only
-- by database functions and triggers; nobody can change or delete them
-- through the API.

-- ---------------------------------------------------------------------------
-- Permission catalogue and the role → permission matrix
-- ---------------------------------------------------------------------------

create table public.permissions (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  -- Needs "clinical authority" on top of the role (vets always, owners optionally).
  requires_clinician boolean not null default false,
  sort_order integer not null unique
);

create table public.role_permissions (
  role public.member_role not null,
  permission text not null references public.permissions (key) on delete cascade,
  primary key (role, permission)
);

insert into public.permissions (key, requires_clinician, sort_order) values
  ('billing.manage', false, 10),
  ('billing.view', false, 20),
  ('organization.manage', false, 30),
  ('members.manage', false, 40),
  ('audit.view', false, 50),
  ('catalog.manage', false, 60),
  ('clients.write', false, 70),
  ('clients.delete', false, 80),
  ('visits.read', false, 90),
  ('visits.write', false, 100),
  ('visits.finalize', true, 110),
  ('visits.reopen', true, 120),
  ('attachments.upload', false, 130),
  ('summary.send_any', false, 140),
  ('summary.send_finalized', false, 150),
  ('templates.manage_own', false, 160);

insert into public.role_permissions (role, permission) values
  ('owner', 'billing.manage'),
  ('owner', 'billing.view'), ('admin', 'billing.view'),
  ('owner', 'organization.manage'), ('admin', 'organization.manage'),
  ('owner', 'members.manage'), ('admin', 'members.manage'),
  ('owner', 'audit.view'), ('admin', 'audit.view'),
  ('owner', 'catalog.manage'), ('admin', 'catalog.manage'), ('vet', 'catalog.manage'),
  ('owner', 'clients.write'), ('admin', 'clients.write'), ('vet', 'clients.write'),
    ('assistant', 'clients.write'), ('receptionist', 'clients.write'),
  ('owner', 'clients.delete'), ('admin', 'clients.delete'), ('vet', 'clients.delete'),
  ('owner', 'visits.read'), ('admin', 'visits.read'), ('vet', 'visits.read'),
    ('assistant', 'visits.read'), ('receptionist', 'visits.read'),
  ('owner', 'visits.write'), ('admin', 'visits.write'), ('vet', 'visits.write'), ('assistant', 'visits.write'),
  ('owner', 'visits.finalize'), ('vet', 'visits.finalize'),
  ('owner', 'visits.reopen'), ('vet', 'visits.reopen'),
  ('owner', 'attachments.upload'), ('admin', 'attachments.upload'), ('vet', 'attachments.upload'),
    ('assistant', 'attachments.upload'),
  ('owner', 'summary.send_any'), ('admin', 'summary.send_any'), ('vet', 'summary.send_any'),
    ('assistant', 'summary.send_any'),
  ('owner', 'summary.send_finalized'), ('admin', 'summary.send_finalized'), ('vet', 'summary.send_finalized'),
    ('assistant', 'summary.send_finalized'), ('receptionist', 'summary.send_finalized'),
  ('owner', 'templates.manage_own'), ('admin', 'templates.manage_own'), ('vet', 'templates.manage_own'),
    ('assistant', 'templates.manage_own');

-- The matrix is not a secret: every signed-in user may read it. Nobody may change it through the API.
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
revoke all on table public.permissions from anon, authenticated;
revoke all on table public.role_permissions from anon, authenticated;
grant select on table public.permissions to authenticated;
grant select on table public.role_permissions to authenticated;
grant all on table public.permissions to service_role;
grant all on table public.role_permissions to service_role;

create policy "permissions: readable by signed-in users"
  on public.permissions for select to authenticated using (true);
create policy "role_permissions: readable by signed-in users"
  on public.role_permissions for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------

create function private.has_permission(p_organization_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.role_permissions rp on rp.role = m.role
    join public.permissions p on p.key = rp.permission
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and rp.permission = p_permission
      and (not p.requires_clinician or m.is_clinician)
  );
$$;

create function private.my_organization_ids_with(p_permission text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.organization_id
  from public.memberships m
  join public.role_permissions rp on rp.role = m.role
  join public.permissions p on p.key = rp.permission
  where m.user_id = (select auth.uid())
    and m.status = 'active'
    and rp.permission = p_permission
    and (not p.requires_clinician or m.is_clinician);
$$;

-- Raises the standard errors, so every function refuses in the same way.
create function private.require_permission(p_organization_id uuid, p_permission text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not private.has_permission(p_organization_id, p_permission) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- "Managed" now means: organizations where I may manage members.
create or replace function private.my_managed_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select private.my_organization_ids_with('members.manage');
$$;

revoke execute on function private.has_permission(uuid, text) from public;
revoke execute on function private.my_organization_ids_with(text) from public;
revoke execute on function private.require_permission(uuid, text) from public;
grant execute on function private.has_permission(uuid, text) to authenticated;
grant execute on function private.my_organization_ids_with(text) to authenticated;

-- The permission keys the signed-in user holds in an organization.
create function public.my_permissions(p_organization_id uuid)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select rp.permission
  from public.memberships m
  join public.role_permissions rp on rp.role = m.role
  join public.permissions p on p.key = rp.permission
  where m.organization_id = p_organization_id
    and m.user_id = (select auth.uid())
    and m.status = 'active'
    and (not p.requires_clinician or m.is_clinician)
  order by p.sort_order;
$$;

revoke execute on function public.my_permissions(uuid) from public, anon;
grant execute on function public.my_permissions(uuid) to authenticated;

-- Editing an organization's details is its own permission.
drop policy "organizations: owners and admins update" on public.organizations;
create policy "organizations: update with organization.manage"
  on public.organizations for update to authenticated
  using (id in (select private.my_organization_ids_with('organization.manage')))
  with check (id in (select private.my_organization_ids_with('organization.manage')));

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  -- Snapshot, so the log stays readable after the person has left.
  actor_name text,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_organization_created_idx on public.audit_log (organization_id, created_at desc);

alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon, authenticated, service_role;
grant select on table public.audit_log to authenticated;
-- The server may add entries (e.g. from payment webhooks) but never change or delete them.
grant select, insert on table public.audit_log to service_role;
grant usage on sequence public.audit_log_id_seq to service_role;

create policy "audit_log: read with audit.view"
  on public.audit_log for select to authenticated
  using (organization_id in (select private.my_organization_ids_with('audit.view')));

create function private.audit(
  p_organization_id uuid,
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_name text;
begin
  select nullif(btrim(coalesce(p.title || ' ', '') || p.full_name), '')
  into v_name
  from public.profiles p
  where p.id = v_actor;

  insert into public.audit_log (organization_id, actor_id, actor_name, action, target_type, target_id, details)
  values (p_organization_id, v_actor, v_name, p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
end;
$$;

revoke execute on function private.audit(uuid, text, text, text, jsonb) from public;

-- Events about the user's own session, reported by the application. Only a
-- fixed list is accepted, and each is recorded in every organization the user
-- belongs to (so an owner can see when their staff signed in).
create function public.log_auth_event(p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_logged boolean := false;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_event not in (
    'auth.sign_in', 'auth.sign_out', 'auth.password_changed',
    'auth.mfa_enabled', 'auth.mfa_disabled', 'auth.recovery_code_used'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  for v_org in
    select m.organization_id from public.memberships m where m.user_id = v_user and m.status = 'active'
  loop
    perform private.audit(v_org, p_event, 'user', v_user::text);
    v_logged := true;
  end loop;

  if not v_logged then
    perform private.audit(null, p_event, 'user', v_user::text);
  end if;
end;
$$;

revoke execute on function public.log_auth_event(text) from public, anon;
grant execute on function public.log_auth_event(text) to authenticated;

-- Changes to an organization's details are logged with the list of changed fields.
create function private.audit_organization_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed text[] := '{}';
begin
  if new.name is distinct from old.name then v_changed := array_append(v_changed, 'name'); end if;
  if new.tax_number is distinct from old.tax_number then v_changed := array_append(v_changed, 'tax_number'); end if;
  if new.country is distinct from old.country then v_changed := array_append(v_changed, 'country'); end if;
  if new.postal_code is distinct from old.postal_code then v_changed := array_append(v_changed, 'postal_code'); end if;
  if new.city is distinct from old.city then v_changed := array_append(v_changed, 'city'); end if;
  if new.address_line is distinct from old.address_line then v_changed := array_append(v_changed, 'address_line'); end if;
  if new.phone is distinct from old.phone then v_changed := array_append(v_changed, 'phone'); end if;
  if new.email is distinct from old.email then v_changed := array_append(v_changed, 'email'); end if;
  if new.type is distinct from old.type then v_changed := array_append(v_changed, 'type'); end if;

  if cardinality(v_changed) > 0 then
    perform private.audit(new.id, 'organization.updated', 'organization', new.id::text,
      jsonb_build_object('fields', to_jsonb(v_changed)));
  end if;
  return new;
end;
$$;

revoke execute on function private.audit_organization_update() from public;

create trigger organizations_audit_update
  after update on public.organizations
  for each row execute function private.audit_organization_update();

-- ---------------------------------------------------------------------------
-- Business functions: now permission based, and audited
-- ---------------------------------------------------------------------------

create or replace function public.create_organization(
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

  perform private.audit(v_org, 'organization.created', 'organization', v_org::text,
    jsonb_build_object('type', p_type));

  return v_org;
end;
$$;

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

  update public.invitations i
  set revoked_at = now()
  where i.organization_id = p_organization_id
    and i.email = v_email
    and i.accepted_at is null
    and i.revoked_at is null;

  insert into public.invitations (organization_id, email, role, token_hash, invited_by, expires_at)
  values (p_organization_id, v_email, p_role, private.hash_token(v_token), auth.uid(), now() + interval '7 days')
  returning id into v_id;

  perform private.audit(p_organization_id, 'invitation.created', 'invitation', v_id::text,
    jsonb_build_object('email', v_email, 'role', p_role));

  return query select v_id, v_token;
end;
$$;

create or replace function public.revoke_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_inv
  from public.invitations i
  where i.id = p_invitation_id and i.accepted_at is null and i.revoked_at is null
  for update;

  -- Someone without the permission learns nothing about whether it exists.
  if not found or not private.has_permission(v_inv.organization_id, 'members.manage') then
    raise exception 'invitation_not_found';
  end if;

  update public.invitations i set revoked_at = now() where i.id = v_inv.id;

  perform private.audit(v_inv.organization_id, 'invitation.revoked', 'invitation', v_inv.id::text,
    jsonb_build_object('email', v_inv.email, 'role', v_inv.role));
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

create or replace function public.update_member(
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
  v_target public.memberships%rowtype;
  v_actor_role public.member_role;
  v_org_type public.organization_type;
  v_is_clinician boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_target from public.memberships m where m.id = p_membership_id for update;
  if not found then
    raise exception 'member_not_found';
  end if;

  perform private.require_permission(v_target.organization_id, 'members.manage');

  select m.role into v_actor_role
  from public.memberships m
  where m.organization_id = v_target.organization_id and m.user_id = auth.uid();

  -- Ownership is special: only an owner may change an owner or grant ownership.
  if (v_target.role = 'owner' or p_role = 'owner') and v_actor_role <> 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_target.role = 'owner' and p_role <> 'owner'
     and private.lock_and_count_active_owners(v_target.organization_id) <= 1 then
    raise exception 'last_owner';
  end if;

  select o.type into v_org_type from public.organizations o where o.id = v_target.organization_id;

  v_is_clinician := case
    when p_role = 'vet' then true
    when p_role = 'owner' then v_org_type = 'individual' or coalesce(p_is_clinician, false)
    else false
  end;

  update public.memberships m
  set role = p_role, is_clinician = v_is_clinician
  where m.id = p_membership_id;

  perform private.audit(v_target.organization_id, 'member.role_changed', 'membership', v_target.id::text,
    jsonb_build_object(
      'user_id', v_target.user_id,
      'from', v_target.role, 'to', p_role,
      'clinician_from', v_target.is_clinician, 'clinician_to', v_is_clinician
    ));
end;
$$;

create or replace function public.set_member_status(p_membership_id uuid, p_status public.member_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.memberships%rowtype;
  v_actor_role public.member_role;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_target from public.memberships m where m.id = p_membership_id for update;
  if not found then
    raise exception 'member_not_found';
  end if;

  perform private.require_permission(v_target.organization_id, 'members.manage');

  select m.role into v_actor_role
  from public.memberships m
  where m.organization_id = v_target.organization_id and m.user_id = auth.uid();

  if v_target.role = 'owner' and v_actor_role <> 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status = 'suspended' and v_target.role = 'owner' and v_target.status = 'active'
     and private.lock_and_count_active_owners(v_target.organization_id) <= 1 then
    raise exception 'last_owner';
  end if;

  update public.memberships m set status = p_status where m.id = p_membership_id;

  if p_status is distinct from v_target.status then
    perform private.audit(
      v_target.organization_id,
      case when p_status = 'suspended' then 'member.suspended' else 'member.reactivated' end,
      'membership', v_target.id::text,
      jsonb_build_object('user_id', v_target.user_id, 'role', v_target.role));
  end if;
end;
$$;

create or replace function public.remove_member(p_membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_target public.memberships%rowtype;
  v_actor_role public.member_role;
  v_leaving boolean;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_target from public.memberships m where m.id = p_membership_id for update;
  if not found then
    raise exception 'member_not_found';
  end if;

  v_leaving := v_target.user_id = v_user;

  -- Anyone may leave; removing someone else needs the permission.
  if not v_leaving then
    perform private.require_permission(v_target.organization_id, 'members.manage');

    select m.role into v_actor_role
    from public.memberships m
    where m.organization_id = v_target.organization_id and m.user_id = v_user;

    if v_target.role = 'owner' and v_actor_role <> 'owner' then
      raise exception 'forbidden' using errcode = '42501';
    end if;
  end if;

  if v_target.role = 'owner' and v_target.status = 'active'
     and private.lock_and_count_active_owners(v_target.organization_id) <= 1 then
    raise exception 'last_owner';
  end if;

  -- Logged before the row disappears, while the actor's membership still exists.
  perform private.audit(
    v_target.organization_id,
    case when v_leaving then 'member.left' else 'member.removed' end,
    'membership', v_target.id::text,
    jsonb_build_object('user_id', v_target.user_id, 'role', v_target.role));

  delete from public.memberships m where m.id = p_membership_id;
end;
$$;

-- E-mail addresses in the member list follow the members.manage permission.
create or replace function public.list_members(p_organization_id uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  full_name text,
  title text,
  email text,
  role public.member_role,
  is_clinician boolean,
  status public.member_status,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id,
    m.user_id,
    p.full_name,
    p.title,
    case when private.has_permission(p_organization_id, 'members.manage') then u.email::text else null end,
    m.role,
    m.is_clinician,
    m.status,
    m.created_at
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  where m.organization_id = p_organization_id
    and p_organization_id in (select private.my_organization_ids())
  order by m.created_at, m.id;
$$;
