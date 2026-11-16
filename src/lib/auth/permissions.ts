/**
 * Permission keys. The database is the source of truth for which role holds
 * which permission (tables `permissions` and `role_permissions`); this list
 * only gives the keys compile-time names. An integration test fails if the
 * two ever differ.
 *
 * Code checks permissions, never roles – a role is just a bundle of these.
 */
export const PERMISSION_KEYS = [
  "billing.manage",
  "billing.view",
  "organization.manage",
  "members.manage",
  "audit.view",
  "catalog.manage",
  "clients.write",
  "clients.delete",
  "visits.read",
  "visits.write",
  "visits.finalize",
  "visits.reopen",
  "attachments.upload",
  "summary.send_any",
  "summary.send_finalized",
  "templates.manage_own",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

const KNOWN: ReadonlySet<string> = new Set(PERMISSION_KEYS);

export function isPermissionKey(value: string): value is PermissionKey {
  return KNOWN.has(value);
}
