/**
 * Audit actions the database writes (see supabase/migrations). Each has a
 * translated label under `audit.actions`; an action that is not listed here
 * is still shown, with a generic label.
 */
export const AUDIT_ACTIONS = [
  "organization.created",
  "organization.updated",
  "invitation.created",
  "invitation.revoked",
  "invitation.accepted",
  "member.role_changed",
  "member.suspended",
  "member.reactivated",
  "member.removed",
  "member.left",
  "auth.sign_in",
  "auth.sign_out",
  "auth.password_changed",
  "auth.mfa_enabled",
  "auth.mfa_disabled",
  "auth.recovery_code_used",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

const KNOWN: ReadonlySet<string> = new Set(AUDIT_ACTIONS);

export function isAuditAction(value: string): value is AuditAction {
  return KNOWN.has(value);
}

/** Events about the user's own session, which the application reports itself. */
export type AuthEvent = Extract<AuditAction, `auth.${string}`>;

/** Organization fields whose changes are named in the log. */
export const AUDITED_ORGANIZATION_FIELDS = [
  "name",
  "tax_number",
  "country",
  "postal_code",
  "city",
  "address_line",
  "phone",
  "email",
  "type",
] as const;

export type AuditedOrganizationField = (typeof AUDITED_ORGANIZATION_FIELDS)[number];

export function isAuditedOrganizationField(value: unknown): value is AuditedOrganizationField {
  return typeof value === "string" && (AUDITED_ORGANIZATION_FIELDS as readonly string[]).includes(value);
}
