-- Member list for the "Munkatársak" screen.
--
-- Names come from profiles, e-mail addresses from auth.users (which is not
-- readable through the API). Every active member may see who their colleagues
-- are; only owners and admins get the e-mail addresses.

create function public.list_members(p_organization_id uuid)
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
    case
      when p_organization_id in (select private.my_managed_organization_ids()) then u.email::text
      else null
    end,
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

revoke execute on function public.list_members(uuid) from public, anon;
grant execute on function public.list_members(uuid) to authenticated;
