/** Translation keys under `auth.errors` in the message files. */
export type AuthErrorKey =
  | "invalidCredentials"
  | "emailNotConfirmed"
  | "weakPassword"
  | "samePassword"
  | "rateLimited"
  | "linkInvalid"
  | "generic";

const BY_CODE: Readonly<Record<string, AuthErrorKey>> = {
  invalid_credentials: "invalidCredentials",
  email_not_confirmed: "emailNotConfirmed",
  weak_password: "weakPassword",
  same_password: "samePassword",
  over_request_rate_limit: "rateLimited",
  over_email_send_rate_limit: "rateLimited",
  otp_expired: "linkInvalid",
  flow_state_expired: "linkInvalid",
  flow_state_not_found: "linkInvalid",
  bad_code_verifier: "linkInvalid",
};

/**
 * Maps a Supabase Auth error to a message we are willing to show. Anything
 * unknown becomes a generic message, so internal details never reach the user.
 */
export function authErrorKey(error: { code?: string | null; status?: number | null }): AuthErrorKey {
  // `Object.hasOwn`, not `in`: a code like "toString" must not match the prototype.
  if (error.code && Object.hasOwn(BY_CODE, error.code)) return BY_CODE[error.code];
  if (error.status === 429) return "rateLimited";
  return "generic";
}
