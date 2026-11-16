import type { Database } from "@/lib/supabase/database.types";

export type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];

/** Plan, status, limits and usage of an organization (see `my_entitlements` in the database). */
export interface Entitlements {
  readonly planKey: string;
  readonly planName: string;
  readonly status: SubscriptionStatus;
  /** Derived by the database; the application never works this out on its own. */
  readonly access: "full" | "read_only";
  readonly trialEndsAt: string | null;
  readonly currentPeriodEnd: string | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly graceEndsAt: string | null;
  /** `null` means unlimited. */
  readonly maxMembers: number | null;
  readonly memberCount: number;
  readonly pendingInvitationCount: number;
  readonly storageGb: number;
  readonly features: readonly string[];
}

/** What, if anything, the user should be told about the subscription right now. */
export type SubscriptionNotice =
  | { kind: "trial"; daysLeft: number }
  | { kind: "trial_ended" }
  | { kind: "past_due"; daysLeft: number }
  | { kind: "canceling"; until: string }
  | { kind: "read_only" };

const DAY_MS = 86_400_000;

/** Whole days until `iso`, rounded up; never negative. "Ends today" is 0. */
export function daysUntil(iso: string, now: Date): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY_MS));
}

export function subscriptionNotice(entitlements: Entitlements, now: Date): SubscriptionNotice | null {
  if (entitlements.access === "read_only") {
    return entitlements.status === "trialing" ? { kind: "trial_ended" } : { kind: "read_only" };
  }

  switch (entitlements.status) {
    case "trialing":
      return entitlements.trialEndsAt ? { kind: "trial", daysLeft: daysUntil(entitlements.trialEndsAt, now) } : null;
    case "past_due":
      return entitlements.graceEndsAt
        ? { kind: "past_due", daysLeft: daysUntil(entitlements.graceEndsAt, now) }
        : null;
    case "canceled":
      return entitlements.currentPeriodEnd ? { kind: "canceling", until: entitlements.currentPeriodEnd } : null;
    case "active":
      return entitlements.cancelAtPeriodEnd && entitlements.currentPeriodEnd
        ? { kind: "canceling", until: entitlements.currentPeriodEnd }
        : null;
  }
}

/** Seats in use, counting pending invitations, and how many are left (`null` = unlimited). */
export function seatUsage(entitlements: Entitlements): { used: number; max: number | null; free: number | null } {
  const used = entitlements.memberCount + entitlements.pendingInvitationCount;
  const max = entitlements.maxMembers;
  return { used, max, free: max === null ? null : Math.max(0, max - used) };
}

/** Plan features the interface knows how to name; unknown ones are ignored. */
export const PLAN_FEATURES = ["templates", "dictation", "pdf_branding", "member_invites", "audit_export"] as const;
export type PlanFeature = (typeof PLAN_FEATURES)[number];

export function isPlanFeature(value: string): value is PlanFeature {
  return (PLAN_FEATURES as readonly string[]).includes(value);
}
