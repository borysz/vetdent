import type { Database } from "@/lib/supabase/database.types";

export type MemberRole = Database["public"]["Enums"]["member_role"];

/** Every role, in the order they are offered in the interface. */
export const MEMBER_ROLES = ["owner", "admin", "vet", "assistant", "receptionist"] as const satisfies readonly MemberRole[];

/** Ownership is never handed out by invitation; it is granted to an existing member. */
export const INVITABLE_ROLES = ["admin", "vet", "assistant", "receptionist"] as const satisfies readonly MemberRole[];

export function isMemberRole(value: string): value is MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(value);
}

/** Owners and admins manage members, invitations and the organization's details. */
export function isManager(role: MemberRole): boolean {
  return role === "owner" || role === "admin";
}

/**
 * Roles the actor may assign to another member. The database enforces the
 * same rule; this only decides what the interface offers.
 */
export function assignableRoles(actorRole: MemberRole): readonly MemberRole[] {
  if (actorRole === "owner") return MEMBER_ROLES;
  if (actorRole === "admin") return INVITABLE_ROLES;
  return [];
}

/** Whether the actor may change, suspend or remove a member with the given role. */
export function canManageMember(actorRole: MemberRole, targetRole: MemberRole): boolean {
  if (!isManager(actorRole)) return false;
  return targetRole !== "owner" || actorRole === "owner";
}
