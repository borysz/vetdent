-- Recovery codes for two-step verification.
--
-- Only hashes are stored. The table is not reachable through the API as a
-- user at all (row level security on, no policies, no grants): the server
-- reads and consumes codes with the secret key, after verifying who is asking.

create table public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, code_hash)
);

create index mfa_recovery_codes_user_id_idx on public.mfa_recovery_codes (user_id);

alter table public.mfa_recovery_codes enable row level security;

revoke all on table public.mfa_recovery_codes from anon, authenticated;
grant all on table public.mfa_recovery_codes to service_role;
