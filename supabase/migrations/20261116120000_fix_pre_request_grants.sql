-- Fix: the pre-request check (private.enforce_mfa) runs for every API role,
-- including the server's own secret-key role. That role had no USAGE on the
-- `private` schema, so every server-side request with the secret key failed
-- with "permission denied for schema private".

grant usage on schema private to service_role;
