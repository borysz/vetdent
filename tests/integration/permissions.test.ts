import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { AUDIT_ACTIONS } from "@/lib/audit/actions";
import { PERMISSION_KEYS } from "@/lib/auth/permissions";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Permissions and the audit log, verified against the real database.
 *
 *   olga   – owns a clinic (not a clinician at first)
 *   vera   – invited as a veterinarian
 *   aron   – invited as an assistant
 *   iris   – an outsider with her own individual account
 * Everything created here is deleted again in `afterAll`.
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

interface TestUser {
  id: string;
  email: string;
  client: Client;
}

const runId = randomUUID().slice(0, 8);
const userIds: string[] = [];
const organizationIds: string[] = [];

async function createTestUser(label: string): Promise<TestUser> {
  const email = `itest-${runId}-${label}@vetdent.test`;
  const password = `${randomUUID()}${randomUUID()}`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Teszt ${label}` },
  });
  if (created.error) throw created.error;
  userIds.push(created.data.user.id);

  const client = createClient<Database>(url!, publishableKey!, stateless);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { id: created.data.user.id, email, client };
}

async function permissionsOf(user: TestUser, organizationId: string): Promise<string[]> {
  const { data, error } = await user.client.rpc("my_permissions", { p_organization_id: organizationId });
  if (error) throw error;
  return data;
}

async function invite(owner: TestUser, organizationId: string, invitee: TestUser, role: "vet" | "assistant") {
  const invited = await owner.client.rpc("create_invitation", {
    p_organization_id: organizationId,
    p_email: invitee.email,
    p_role: role,
  });
  if (invited.error) throw invited.error;
  const accepted = await invitee.client.rpc("accept_invitation", { p_token: invited.data[0].token });
  if (accepted.error) throw accepted.error;
}

async function membershipId(user: TestUser, organizationId: string): Promise<string> {
  const { data, error } = await admin
    .from("memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .single();
  if (error) throw error;
  return data.id;
}

let olga: TestUser;
let vera: TestUser;
let aron: TestUser;
let iris: TestUser;
let clinicId: string;
let individualId: string;

beforeAll(async () => {
  [olga, vera, aron, iris] = await Promise.all([
    createTestUser("olga"),
    createTestUser("vera"),
    createTestUser("aron"),
    createTestUser("iris"),
  ]);

  const clinic = await olga.client.rpc("create_organization", {
    p_type: "clinic",
    p_name: `Jogosultság Teszt ${runId}`,
    p_tax_number: "12345678-1-42",
  });
  if (clinic.error) throw clinic.error;
  clinicId = clinic.data;
  organizationIds.push(clinicId);

  const individual = await iris.client.rpc("create_organization", { p_type: "individual", p_name: "Dr. Teszt Iris" });
  if (individual.error) throw individual.error;
  individualId = individual.data;
  organizationIds.push(individualId);

  await invite(olga, clinicId, vera, "vet");
  await invite(olga, clinicId, aron, "assistant");
});

afterAll(async () => {
  if (organizationIds.length > 0) {
    await admin.from("organizations").delete().in("id", organizationIds);
  }
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe("permission catalogue", () => {
  test("the keys in the code match the keys in the database", async () => {
    const { data, error } = await olga.client.from("permissions").select("key").order("sort_order");
    expect(error).toBeNull();
    expect(data?.map((row) => row.key)).toEqual([...PERMISSION_KEYS]);
  });

  test("the matrix cannot be changed through the API", async () => {
    const before = await admin.from("role_permissions").select("role", { count: "exact", head: true });

    const added = await olga.client.from("role_permissions").insert({ role: "assistant", permission: "members.manage" });
    expect(added.error).not.toBeNull();

    await olga.client.from("role_permissions").delete().eq("role", "owner");
    await olga.client.from("permissions").delete().eq("key", "visits.read");

    const after = await admin.from("role_permissions").select("role", { count: "exact", head: true });
    expect(after.count).toBe(before.count);
    expect(after.count).toBeGreaterThan(0);
  });
});

describe("what each role may do", () => {
  test("an owner manages the account, but finalises records only as a clinician", async () => {
    const asOwner = await permissionsOf(olga, clinicId);
    expect(asOwner).toEqual(expect.arrayContaining(["billing.manage", "members.manage", "audit.view", "visits.write"]));
    expect(asOwner).not.toContain("visits.finalize");
    expect(asOwner).not.toContain("visits.reopen");

    const marked = await olga.client.rpc("update_member", {
      p_membership_id: await membershipId(olga, clinicId),
      p_role: "owner",
      p_is_clinician: true,
    });
    expect(marked.error).toBeNull();

    const asClinician = await permissionsOf(olga, clinicId);
    expect(asClinician).toEqual(expect.arrayContaining(["visits.finalize", "visits.reopen"]));
  });

  test("a veterinarian has clinical permissions but does not manage the account", async () => {
    const permissions = await permissionsOf(vera, clinicId);
    expect(permissions).toEqual(expect.arrayContaining(["visits.finalize", "visits.reopen", "catalog.manage"]));
    for (const forbidden of ["members.manage", "organization.manage", "audit.view", "billing.view"]) {
      expect(permissions).not.toContain(forbidden);
    }
  });

  test("an assistant edits drafts but cannot finalise or delete", async () => {
    const permissions = await permissionsOf(aron, clinicId);
    expect(permissions).toEqual(expect.arrayContaining(["visits.write", "clients.write", "attachments.upload"]));
    for (const forbidden of ["visits.finalize", "clients.delete", "catalog.manage", "members.manage"]) {
      expect(permissions).not.toContain(forbidden);
    }
  });

  test("an individual veterinarian holds every permission in their own account", async () => {
    expect(await permissionsOf(iris, individualId)).toEqual([...PERMISSION_KEYS]);
  });

  test("an outsider holds no permission in someone else's organization", async () => {
    expect(await permissionsOf(iris, clinicId)).toEqual([]);
  });

  test("permissions follow the role immediately", async () => {
    const promote = await olga.client.rpc("update_member", {
      p_membership_id: await membershipId(aron, clinicId),
      p_role: "admin",
    });
    expect(promote.error).toBeNull();

    expect(await permissionsOf(aron, clinicId)).toEqual(
      expect.arrayContaining(["members.manage", "organization.manage", "audit.view"]),
    );

    // The new admin can now edit the organization's details.
    const updated = await aron.client.from("organizations").update({ phone: "+36 1 000 0000" }).eq("id", clinicId).select("id");
    expect(updated.error).toBeNull();
    expect(updated.data).toHaveLength(1);

    // The veterinarian still cannot.
    const refused = await vera.client.from("organizations").update({ phone: "x" }).eq("id", clinicId).select("id");
    expect(refused.data).toEqual([]);
  });
});

describe("audit log", () => {
  test("what happened in the organization is recorded with the actor's name", async () => {
    const { data, error } = await olga.client
      .from("audit_log")
      .select("action, actor_name, details")
      .eq("organization_id", clinicId)
      .order("id");
    expect(error).toBeNull();

    const actions = data!.map((entry) => entry.action);
    expect(actions).toEqual([
      "organization.created",
      "invitation.created",
      "invitation.accepted",
      "invitation.created",
      "invitation.accepted",
      "member.role_changed",
      "member.role_changed",
      "organization.updated",
    ]);
    for (const action of actions) {
      expect(AUDIT_ACTIONS as readonly string[], action).toContain(action);
    }

    expect(data![0].actor_name).toBe("Teszt olga");
    expect(data![1].details).toEqual({ email: vera.email, role: "vet" });
    expect(data![2].actor_name).toBe("Teszt vera");
    expect(data![6].details).toMatchObject({ from: "assistant", to: "admin", user_id: aron.id });
    expect(data![7]).toMatchObject({ actor_name: "Teszt aron", details: { fields: ["phone"] } });
  });

  test("only roles with audit.view can read it", async () => {
    const asVet = await vera.client.from("audit_log").select("id").eq("organization_id", clinicId);
    expect(asVet.data).toEqual([]);

    const asOutsider = await iris.client.from("audit_log").select("id").eq("organization_id", clinicId);
    expect(asOutsider.data).toEqual([]);

    const asAdmin = await aron.client.from("audit_log").select("id").eq("organization_id", clinicId);
    expect(asAdmin.data?.length).toBeGreaterThan(0);
  });

  test("entries cannot be added, changed or deleted through the API", async () => {
    const forged = await olga.client.from("audit_log").insert({ organization_id: clinicId, action: "member.removed" });
    expect(forged.error).not.toBeNull();

    const edited = await olga.client.from("audit_log").update({ action: "auth.sign_in" }).eq("organization_id", clinicId);
    expect(edited.error).not.toBeNull();

    const deleted = await olga.client.from("audit_log").delete().eq("organization_id", clinicId);
    expect(deleted.error).not.toBeNull();

    // Not even the server's secret key may rewrite history.
    const serverEdit = await admin.from("audit_log").update({ action: "auth.sign_in" }).eq("organization_id", clinicId);
    expect(serverEdit.error).not.toBeNull();
    const serverDelete = await admin.from("audit_log").delete().eq("organization_id", clinicId);
    expect(serverDelete.error).not.toBeNull();
  });

  test("session events are recorded, but only the allowed ones", async () => {
    const logged = await vera.client.rpc("log_auth_event", { p_event: "auth.sign_in" });
    expect(logged.error).toBeNull();

    const invented = await vera.client.rpc("log_auth_event", { p_event: "member.removed" });
    expect(invented.error?.message).toBe("forbidden");

    const { data } = await olga.client
      .from("audit_log")
      .select("action, actor_name")
      .eq("organization_id", clinicId)
      .eq("action", "auth.sign_in");
    expect(data).toEqual([{ action: "auth.sign_in", actor_name: "Teszt vera" }]);
  });

  test("removing a member is recorded even though the membership is gone", async () => {
    const removed = await olga.client.rpc("remove_member", { p_membership_id: await membershipId(vera, clinicId) });
    expect(removed.error).toBeNull();

    const { data } = await olga.client
      .from("audit_log")
      .select("action, details")
      .eq("organization_id", clinicId)
      .eq("action", "member.removed");
    expect(data).toHaveLength(1);
    expect(data![0].details).toMatchObject({ user_id: vera.id, role: "vet" });
  });
});
