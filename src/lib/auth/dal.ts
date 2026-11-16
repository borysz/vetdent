import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isPermissionKey, type PermissionKey } from "@/lib/auth/permissions";
import type { Entitlements } from "@/lib/billing/status";
import { routes } from "@/lib/routes";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Data access layer for identity. Every server-side read of "who is this and
 * which organization are they working in" goes through here, so the checks
 * live in one place. All functions are request-scoped (React `cache`), which
 * means the session is verified once per request however often they are called.
 */

export type MemberRole = Database["public"]["Enums"]["member_role"];
export type MemberStatus = Database["public"]["Enums"]["member_status"];
export type OrganizationType = Database["public"]["Enums"]["organization_type"];

export interface CurrentUser {
  readonly id: string;
  readonly email: string;
  /**
   * The user has two-step verification switched on, but this session has only
   * passed the password step. Such a session may do nothing but complete the
   * challenge. (The database refuses its requests too – this flag only decides
   * where to send the user.)
   */
  readonly mfaPending: boolean;
}

export interface Membership {
  readonly id: string;
  readonly role: MemberRole;
  readonly isClinician: boolean;
  readonly organization: {
    readonly id: string;
    readonly name: string;
    readonly type: OrganizationType;
  };
}

/** Cookie that remembers which organization the user is working in. */
export const ACTIVE_ORGANIZATION_COOKIE = "vd_org";

/** The signed-in user, verified against the token signature; `null` if not signed in. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Verifying a session compares the token's expiry with the current time, so
  // the result must never be prerendered or prefetched: always run per request.
  await connection();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const { sub, email } = data.claims;
  if (typeof sub !== "string" || sub.length === 0) return null;

  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const mfaPending = assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2";

  return { id: sub, email: typeof email === "string" ? email : "", mfaPending };
});

/**
 * Like `getCurrentUser`, but sends anonymous visitors to the login page and
 * half-verified sessions to the two-step challenge.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (user.mfaPending) redirect(routes.mfaChallenge);
  return user;
}

/** The user's active memberships, oldest first. Suspended ones are left out. */
export const getMemberships = cache(async (): Promise<readonly Membership[]> => {
  const user = await getCurrentUser();
  if (!user || user.mfaPending) return [];

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("id, role, is_clinician, organization:organizations (id, name, type)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Could not load memberships: ${error.message}`);
  }

  return data.flatMap((row) =>
    row.organization
      ? [
          {
            id: row.id,
            role: row.role,
            isClinician: row.is_clinician,
            organization: row.organization,
          },
        ]
      : [],
  );
});

/**
 * The membership the user is currently working in: the one named by the
 * cookie if it is still valid, otherwise the first one. `null` means the user
 * has no organization yet and must go through onboarding.
 */
export const getActiveMembership = cache(async (): Promise<Membership | null> => {
  const memberships = await getMemberships();
  if (memberships.length === 0) return null;

  const preferred = (await cookies()).get(ACTIVE_ORGANIZATION_COOKIE)?.value;
  return memberships.find((membership) => membership.organization.id === preferred) ?? memberships[0];
});

export interface Profile {
  readonly fullName: string;
  readonly title: string | null;
}

/** The signed-in user's own profile; `null` when not signed in. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user || user.mfaPending) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, title")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load profile: ${error.message}`);
  }

  return data ? { fullName: data.full_name, title: data.title } : null;
});

/**
 * The permission keys the user holds in the organization they are working in.
 * Comes from the database, so the application and row level security always
 * agree. Empty when there is no session or no organization.
 */
export const getPermissions = cache(async (): Promise<ReadonlySet<PermissionKey>> => {
  const membership = await getActiveMembership();
  if (!membership) return new Set();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_permissions", {
    p_organization_id: membership.organization.id,
  });
  if (error) {
    throw new Error(`Could not load permissions: ${error.message}`);
  }

  return new Set(data.filter(isPermissionKey));
});

/**
 * Plan, subscription status, limits and usage of the organization the user is
 * working in. `null` when there is no organization (or, defensively, no
 * subscription row).
 */
export const getEntitlements = cache(async (): Promise<Entitlements | null> => {
  const membership = await getActiveMembership();
  if (!membership) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_entitlements", {
    p_organization_id: membership.organization.id,
  });
  if (error) {
    throw new Error(`Could not load the subscription: ${error.message}`);
  }

  const row = data[0];
  if (!row) return null;

  return {
    planKey: row.plan_key,
    planName: row.plan_name,
    status: row.status,
    access: row.access === "full" ? "full" : "read_only",
    trialEndsAt: row.trial_ends_at,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    graceEndsAt: row.grace_ends_at,
    maxMembers: row.max_members,
    memberCount: row.member_count,
    pendingInvitationCount: row.pending_invitation_count,
    storageGb: row.storage_gb,
    features: row.features,
  };
});

export async function hasPermission(permission: PermissionKey): Promise<boolean> {
  return (await getPermissions()).has(permission);
}

/**
 * For Server Actions and pages that need a permission. Without it the user is
 * sent back to the dashboard; the database would refuse the operation anyway.
 */
export async function requirePermission(
  permission: PermissionKey,
): Promise<{ user: CurrentUser; membership: Membership }> {
  const context = await requireActiveMembership();
  if (!(await hasPermission(permission))) redirect(routes.app);
  return context;
}

/** For pages inside the app: a signed-in user with an organization, or a redirect. */
export async function requireActiveMembership(): Promise<{ user: CurrentUser; membership: Membership }> {
  const user = await requireUser();
  const membership = await getActiveMembership();
  if (!membership) redirect(routes.onboarding);
  return { user, membership };
}
