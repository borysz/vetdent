import { describe, expect, test } from "vitest";
import { daysUntil, seatUsage, subscriptionNotice, type Entitlements } from "./status";

const now = new Date("2026-11-16T10:00:00Z");
const inDays = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

const base: Entitlements = {
  planKey: "clinic",
  planName: "Rendelő",
  status: "active",
  access: "full",
  trialEndsAt: null,
  currentPeriodEnd: inDays(20),
  cancelAtPeriodEnd: false,
  graceEndsAt: null,
  maxMembers: 10,
  memberCount: 3,
  pendingInvitationCount: 2,
  storageGb: 100,
  features: ["templates"],
};

describe("daysUntil", () => {
  test("rounds up to whole days and never goes negative", () => {
    expect(daysUntil(inDays(13.2), now)).toBe(14);
    expect(daysUntil(inDays(1), now)).toBe(1);
    expect(daysUntil(inDays(0.01), now)).toBe(1);
    expect(daysUntil(inDays(0), now)).toBe(0);
    expect(daysUntil(inDays(-3), now)).toBe(0);
  });
});

describe("subscriptionNotice", () => {
  test("an active, paid subscription needs no notice", () => {
    expect(subscriptionNotice(base, now)).toBeNull();
  });

  test("a running trial shows the days left", () => {
    expect(subscriptionNotice({ ...base, status: "trialing", trialEndsAt: inDays(5.5) }, now)).toEqual({
      kind: "trial",
      daysLeft: 6,
    });
  });

  test("an ended trial is told apart from a lapsed subscription", () => {
    expect(
      subscriptionNotice({ ...base, status: "trialing", access: "read_only", trialEndsAt: inDays(-1) }, now),
    ).toEqual({ kind: "trial_ended" });
    expect(subscriptionNotice({ ...base, status: "canceled", access: "read_only" }, now)).toEqual({
      kind: "read_only",
    });
    expect(subscriptionNotice({ ...base, status: "past_due", access: "read_only" }, now)).toEqual({
      kind: "read_only",
    });
  });

  test("a failed payment shows how long the grace period lasts", () => {
    expect(subscriptionNotice({ ...base, status: "past_due", graceEndsAt: inDays(4.2) }, now)).toEqual({
      kind: "past_due",
      daysLeft: 5,
    });
  });

  test("a cancelled subscription shows when it ends", () => {
    const until = inDays(9);
    expect(subscriptionNotice({ ...base, cancelAtPeriodEnd: true, currentPeriodEnd: until }, now)).toEqual({
      kind: "canceling",
      until,
    });
    expect(subscriptionNotice({ ...base, status: "canceled", currentPeriodEnd: until }, now)).toEqual({
      kind: "canceling",
      until,
    });
  });
});

describe("seatUsage", () => {
  test("pending invitations use seats too", () => {
    expect(seatUsage(base)).toEqual({ used: 5, max: 10, free: 5 });
  });

  test("free seats never go below zero after a downgrade", () => {
    expect(seatUsage({ ...base, maxMembers: 4 })).toEqual({ used: 5, max: 4, free: 0 });
  });

  test("an unlimited plan has no maximum", () => {
    expect(seatUsage({ ...base, maxMembers: null })).toEqual({ used: 5, max: null, free: null });
  });
});
