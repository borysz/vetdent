-- Two-step verification is enforced by the database, not only by the app.
--
-- If a user has a verified authenticator factor, a session that has only
-- passed the password step (assurance level "aal1") may not read or change
-- anything through the API. The check runs before every API request
-- (PostgREST pre-request hook), so it covers every table and every function,
-- including ones added later.

grant usage on schema private to anon;

create function private.enforce_mfa()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'authenticated'
     and coalesce((select auth.jwt()) ->> 'aal', 'aal1') <> 'aal2'
     and exists (
       select 1
       from auth.mfa_factors f
       where f.user_id = (select auth.uid())
         and f.status = 'verified'
     )
  then
    raise exception 'mfa_required' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function private.enforce_mfa() from public;
grant execute on function private.enforce_mfa() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'private.enforce_mfa';
notify pgrst, 'reload config';
