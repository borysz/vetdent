/**
 * Error codes raised by the database functions (see supabase/migrations).
 * Each one is also a translation key under `dbErrors` in the message files.
 */
export const DB_ERROR_KEYS = [
  "not_authenticated",
  "forbidden",
  "individual_account_exists",
  "organization_limit_reached",
  "individual_cannot_invite",
  "cannot_invite_owner",
  "invalid_email",
  "already_member",
  "invitation_not_found",
  "invitation_already_accepted",
  "invitation_revoked",
  "invitation_expired",
  "invitation_email_mismatch",
  "email_not_confirmed",
  "member_not_found",
  "last_owner",
  "mfa_required",
] as const;

export type DbErrorKey = (typeof DB_ERROR_KEYS)[number] | "unknown";

const KNOWN: ReadonlySet<string> = new Set(DB_ERROR_KEYS);

/**
 * Maps a database error to a translation key. Anything that is not one of our
 * own codes becomes "unknown", so raw database messages never reach the user.
 */
export function dbErrorKey(error: { message?: string | null }): DbErrorKey {
  const message = error.message ?? "";
  return KNOWN.has(message) ? (message as DbErrorKey) : "unknown";
}
