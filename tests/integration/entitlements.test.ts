import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Plans, trial, limits and read-only mode, verified against the real database.
 *
 *   petra  – owns a clinic
 *   tibor, zita – people she invites
 *   ida    – an outsider with her own individual account
 * The seat-limit tests use a private, throw-away plan so the real plans are
 * never modified. Everything created here is deleted again in `afterAll`.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !publishableKey || !secretKey) {
  throw new Error("Integration tests need the Supabase settings from .env.local.");
}

type Client = SupabaseClient<Database>;
const stateless = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const admin: Client = createClient<Database>(url, secretKey, stateless);
const anonymous: Client = createClient<Database>(url, publishableKey, stateless);

interface TestUser {
  id: string;
  email: string;
  client: Client;
}

const runId = randomUUID().slice(0, 8);
const userIds: string[] = [];
const organizationIds: string[] = [];
let temporaryPlanId: string | undefined;

async function createTestUser(label: string): Promise<TestUser> {
  const email = `itest-${runId}-${label}@vetdent.test`;
  const password = `${randomUUID()}${randomUUID()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userIds.push(created.data.user.id);

  const client = createClient<Database>(url!, publishableKey!, stateless);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { id: created.data.user.id, email, client };
}

async function entitlementsOf(user: TestUser, organizationId: string) {
  const { data, error } = await user.client.rpc("my_entitlements", { p_organization_id: organizationId });
  if (error) throw error;
  return data[0];
}

async function setSubscription(
  organizationId: string,
  values: Database["public"]["Tables"]["subscriptions"]["Update"],
): Promise<void> {
  const { error } = await admin.from("subscriptions").update(values).eq("organization_id", organizationId);
  if (error) throw error;
}

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

let petra: TestUser;
let tibor: TestUser;
let zita: TestUser;
let ida: TestUser;
let clinicId: string;
let individualId: string;

beforeAll(async () => {
  [petra, tibor, zita, ida] = await Promise.all([
    createTestUser("petra"),
    createTestUser("tibor"),
    createTestUser("zita"),
    createTestUser("ida"),
  ]);

  const clinic = await petra.client.rpc("create_organization", {
    p_type: "clinic",
    p_name: `Csomag Teszt ${runId}`,
    p_tax_number: "12345678-1-42",
  });
  if (clinic.error) throw clinic.error;
  clinicId = clinic.data;
  organizationIds.push(clinicId);

  const individual = await ida.client.rpc("create_organization", { p_type: "individual", p_name: "Dr. Teszt Ida" });
  if (individual.error) throw individual.error;
  individualId = individual.data;
  organizationIds.push(individualId);
});

afterAll(async () => {
  if (organizationIds.length > 0) {
    await admin.from("organizations").delete().in("id", organizationIds);
  }
  if (temporaryPlanId) {
    await admin.from("plans").delete().eq("id", temporaryPlanId);
  }
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe("trial", () => {
  test("a new clinic starts a 14-day trial on the clinic plan", async () => {
    const entitlements = await entitlementsOf(petra, clinicId);
    expect(entitlements).toMatchObject({
      plan_key: "clinic",
      status: "trialing",
      access: "full",
      max_members: 10,
      member_count: 1,
      pending_invitation_count: 0,
      cancel_at_period_end: false,
    });
    expect(entitlements.features).toContain("member_invites");

    const daysLeft = (new Date(entitlements.trial_ends_at!).getTime() - Date.now()) / 86_400_000;
    expect(daysLeft).toBeGreaterThan(13.9);
    // The server's clock and this machine's clock can differ by seconds; a minute is tolerated.
    expect(daysLeft).toBeLessThanOrEqual(14 + 1 / 1440);
  });

  test("storage is capped during the trial", async () => {
    expect((await entitlementsOf(petra, clinicId)).storage_gb).toBe(2);
  });

  test("an individual veterinarian starts on the single-user plan", async () => {
    expect(await entitlementsOf(ida, individualId)).toMatchObject({
      plan_key: "individual",
      status: "trialing",
      access: "full",
      max_members: 1,
      member_count: 1,
    });
  });

  test("an outsider learns nothing about another organization's subscription", async () => {
    const { data, error } = await ida.client.rpc("my_entitlements", { p_organization_id: clinicId });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("price list and privacy", () => {
  test("the public price list shows the plans without payment identifiers", async () => {
    const { data, error } = await anonymous.rpc("list_public_plans");
    expect(error).toBeNull();
    expect(data?.map((plan) => plan.key)).toEqual(["individual", "clinic"]);
    for (const plan of data!) {
      expect(Object.keys(plan).some((column) => column.startsWith("stripe"))).toBe(false);
      expect(plan.trial_days).toBe(14);
    }
  });

  test("plans, subscriptions and billing settings cannot be read or changed directly", async () => {
    for (const table of ["plans", "subscriptions", "billing_settings"] as const) {
      const read = await petra.client.from(table).select("*");
      expect(read.error, table).not.toBeNull();
    }

    const extended = await petra.client
      .from("subscriptions")
      .update({ trial_ends_at: daysFromNow(3650) })
      .eq("organization_id", clinicId);
    expect(extended.error).not.toBeNull();
  });
});

describe("seat limit", () => {
  beforeAll(async () => {
    // Letters only, as the plan key format requires.
    const letters = randomUUID().replace(/[^a-f]/g, "").padEnd(8, "x").slice(0, 8);
    const plan = await admin
      .from("plans")
      .insert({
        key: `itest_${letters}`,
        name: "Teszt csomag",
        audience: "clinic",
        is_public: false,
        max_members: 2,
        storage_gb: 1,
        features: ["member_invites"],
      })
      .select("id")
      .single();
    if (plan.error) throw plan.error;
    temporaryPlanId = plan.data.id;
    await setSubscription(clinicId, { plan_id: temporaryPlanId });
  });

  test("a private plan does not appear on the public price list", async () => {
    const { data } = await anonymous.rpc("list_public_plans");
    expect(data?.map((plan) => plan.key)).toEqual(["individual", "clinic"]);
  });

  test("pending invitations count towards the limit", async () => {
    const first = await petra.client.rpc("create_invitation", {
      p_organization_id: clinicId,
      p_email: tibor.email,
      p_role: "vet",
    });
    expect(first.error).toBeNull();

    const second = await petra.client.rpc("create_invitation", {
      p_organization_id: clinicId,
      p_email: zita.email,
      p_role: "assistant",
    });
    expect(second.error?.message).toBe("seat_limit_reached");

    expect(await entitlementsOf(petra, clinicId)).toMatchObject({
      max_members: 2,
      member_count: 1,
      pending_invitation_count: 1,
    });
  });

  test("re-inviting the same address does not use a second seat", async () => {
    const again = await petra.client.rpc("create_invitation", {
      p_organization_id: clinicId,
      p_email: tibor.email,
      p_role: "assistant",
    });
    expect(again.error).toBeNull();

    const accepted = await tibor.client.rpc("accept_invitation", { p_token: again.data![0].token });
    expect(accepted.error).toBeNull();

    expect(await entitlementsOf(petra, clinicId)).toMatchObject({ member_count: 2, pending_invitation_count: 0 });
  });

  test("a full organization cannot invite anyone else", async () => {
    const full = await petra.client.rpc("create_invitation", {
      p_organization_id: clinicId,
      p_email: zita.email,
      p_role: "assistant",
    });
    expect(full.error?.message).toBe("seat_limit_reached");
  });
});

describe("read-only mode", () => {
  test("an expired trial makes the organization read-only, without deleting anything", async () => {
    await setSubscription(clinicId, { trial_ends_at: daysFromNow(-1) });

    expect((await entitlementsOf(petra, clinicId)).access).toBe("read_only");

    const invite = await petra.client.rpc("create_invitation", {
      p_organization_id: clinicId,
      p_email: zita.email,
      p_role: "assistant",
    });
    expect(invite.error?.message).toBe("read_only");

    // Existing data is still there and readable.
    const organizations = await petra.client.from("organizations").select("id").eq("id", clinicId);
    expect(organizations.data).toHaveLength(1);
    const members = await petra.client.rpc("list_members", { p_organization_id: clinicId });
    expect(members.data).toHaveLength(2);
  });

  test("an active subscription has full access", async () => {
    await setSubscription(clinicId, { status: "active", current_period_end: daysFromNow(20) });
    expect((await entitlementsOf(petra, clinicId)).access).toBe("full");
  });

  test("a failed payment keeps full access during the grace period only", async () => {
    await setSubscription(clinicId, { status: "past_due", past_due_since: daysFromNow(-2) });
    const inGrace = await entitlementsOf(petra, clinicId);
    expect(inGrace.access).toBe("full");
    expect(new Date(inGrace.grace_ends_at!).getTime()).toBeGreaterThan(Date.now());

    await setSubscription(clinicId, { past_due_since: daysFromNow(-8) });
    expect((await entitlementsOf(petra, clinicId)).access).toBe("read_only");
  });

  test("a cancelled subscription works until the end of the paid period", async () => {
    await setSubscription(clinicId, { status: "canceled", current_period_end: daysFromNow(5), past_due_since: null });
    expect((await entitlementsOf(petra, clinicId)).access).toBe("full");

    await setSubscription(clinicId, { current_period_end: daysFromNow(-1) });
    expect((await entitlementsOf(petra, clinicId)).access).toBe("read_only");
  });
});
