import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Tenant isolation and membership rules, verified against the real database.
 *
 * Three throw-away users are created with random credentials:
 *   anna  – creates a clinic and owns it
 *   bela  – gets invited into Anna's clinic
 *   cili  – an outsider with her own individual account
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
const anonymous: Client = createClient<Database>(url, publishableKey, stateless);

interface TestUser {
  id: string;
  email: string;
  client: Client;
}

const runId = randomUUID().slice(0, 8);
const createdUserIds: string[] = [];
const createdOrganizationIds: string[] = [];

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
  createdUserIds.push(created.data.user.id);

  const client = createClient<Database>(url!, publishableKey!, stateless);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;

  return { id: created.data.user.id, email, client };
}

async function membershipOf(user: TestUser, organizationId: string) {
  const { data, error } = await admin
    .from("memberships")
    .select("id, role, is_clinician, status")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .single();
  if (error) throw error;
  return data;
}

let anna: TestUser;
let bela: TestUser;
let cili: TestUser;
let clinicId: string;
let invitationToken: string;

beforeAll(async () => {
  [anna, bela, cili] = await Promise.all([createTestUser("anna"), createTestUser("bela"), createTestUser("cili")]);
});

afterAll(async () => {
  if (createdOrganizationIds.length > 0) {
    await admin.from("organizations").delete().in("id", createdOrganizationIds);
  }
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe("registration", () => {
  test("a profile is created for every new user", async () => {
    const { data, error } = await anna.client.from("profiles").select("id, full_name").eq("id", anna.id).single();
    expect(error).toBeNull();
    expect(data?.full_name).toBe("Teszt anna");
  });

  test("a user without an organization sees no organizations", async () => {
    const { data, error } = await anna.client.from("organizations").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe("creating organizations", () => {
  test("a clinic needs a tax number", async () => {
    const { error } = await anna.client.rpc("create_organization", { p_type: "clinic", p_name: "Adószám nélkül" });
    expect(error).not.toBeNull();
  });

  test("the creator becomes the owner of the clinic", async () => {
    const { data, error } = await anna.client.rpc("create_organization", {
      p_type: "clinic",
      p_name: `Teszt Rendelő ${runId}`,
      p_tax_number: "12345678-1-42",
      p_city: "Budapest",
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    clinicId = data!;
    createdOrganizationIds.push(clinicId);

    const membership = await membershipOf(anna, clinicId);
    expect(membership).toMatchObject({ role: "owner", is_clinician: false, status: "active" });
  });

  test("an individual account makes its only member a clinician, and there can be only one", async () => {
    const first = await cili.client.rpc("create_organization", { p_type: "individual", p_name: "Dr. Teszt Cili" });
    expect(first.error).toBeNull();
    createdOrganizationIds.push(first.data!);
    expect(await membershipOf(cili, first.data!)).toMatchObject({ role: "owner", is_clinician: true });

    const second = await cili.client.rpc("create_organization", { p_type: "individual", p_name: "Még egy" });
    expect(second.error?.message).toBe("individual_account_exists");
  });

  test("an anonymous visitor cannot create an organization", async () => {
    const { error } = await anonymous.rpc("create_organization", { p_type: "individual", p_name: "Névtelen" });
    expect(error).not.toBeNull();
  });
});

describe("tenant isolation", () => {
  test("an outsider cannot see the clinic, its members or its owner's profile", async () => {
    const organizations = await cili.client.from("organizations").select("id").eq("id", clinicId);
    expect(organizations.data).toEqual([]);

    const memberships = await cili.client.from("memberships").select("id").eq("organization_id", clinicId);
    expect(memberships.data).toEqual([]);

    const profiles = await cili.client.from("profiles").select("id").eq("id", anna.id);
    expect(profiles.data).toEqual([]);
  });

  test("an outsider cannot change the clinic", async () => {
    await cili.client.from("organizations").update({ name: "Feltörve" }).eq("id", clinicId);

    const { data } = await admin.from("organizations").select("name").eq("id", clinicId).single();
    expect(data?.name).toBe(`Teszt Rendelő ${runId}`);
  });

  test("nobody can add themselves to an organization directly", async () => {
    const { error } = await cili.client
      .from("memberships")
      .insert({ organization_id: clinicId, user_id: cili.id, role: "owner" });
    expect(error).not.toBeNull();

    const { data } = await admin.from("memberships").select("id").eq("organization_id", clinicId);
    expect(data).toHaveLength(1);
  });

  test("an anonymous visitor sees nothing at all", async () => {
    for (const table of ["organizations", "memberships", "profiles", "invitations"] as const) {
      const { data } = await anonymous.from(table).select("id");
      expect(data ?? [], table).toEqual([]);
    }
  });
});

describe("invitations", () => {
  test("an outsider cannot invite into someone else's clinic", async () => {
    const { error } = await cili.client.rpc("create_invitation", {
      p_organization_id: clinicId,
      p_email: bela.email,
      p_role: "admin",
    });
    expect(error?.message).toBe("forbidden");
  });

  test("an individual account cannot invite anyone", async () => {
    const { error } = await cili.client.rpc("create_invitation", {
      p_organization_id: createdOrganizationIds[1],
      p_email: bela.email,
      p_role: "assistant",
    });
    expect(error?.message).toBe("individual_cannot_invite");
  });

  test("ownership cannot be handed out by invitation", async () => {
    const { error } = await anna.client.rpc("create_invitation", {
      p_organization_id: clinicId,
      p_email: bela.email,
      p_role: "owner",
    });
    expect(error?.message).toBe("cannot_invite_owner");
  });

  test("the owner invites a veterinarian and gets a one-time token", async () => {
    const { data, error } = await anna.client.rpc("create_invitation", {
      p_organization_id: clinicId,
      p_email: bela.email.toUpperCase(),
      p_role: "vet",
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    invitationToken = data![0].token;
    expect(invitationToken).toMatch(/^[0-9a-f]{64}$/);
  });

  test("the stored token hash is never readable, not even by the owner", async () => {
    const listed = await anna.client.from("invitations").select("id, email, role").eq("organization_id", clinicId);
    expect(listed.error).toBeNull();
    expect(listed.data).toHaveLength(1);
    expect(listed.data?.[0]).toMatchObject({ email: bela.email, role: "vet" });

    // `token_hash` is deliberately not granted; cast past the generated types to prove the database refuses it.
    const leaked = await anna.client.from("invitations").select("token_hash" as "id");
    expect(leaked.error).not.toBeNull();
  });

  test("the invitation page can show the clinic name before sign-in", async () => {
    const { data, error } = await anonymous.rpc("get_invitation", { p_token: invitationToken });
    expect(error).toBeNull();
    expect(data).toEqual([
      { organization_name: `Teszt Rendelő ${runId}`, email: bela.email, role: "vet", state: "pending" },
    ]);

    const unknown = await anonymous.rpc("get_invitation", { p_token: "0".repeat(64) });
    expect(unknown.data).toEqual([]);
  });

  test("only the invited address can accept", async () => {
    const { error } = await cili.client.rpc("accept_invitation", { p_token: invitationToken });
    expect(error?.message).toBe("invitation_email_mismatch");
  });

  test("accepting makes the invitee a clinician member, exactly once", async () => {
    const accepted = await bela.client.rpc("accept_invitation", { p_token: invitationToken });
    expect(accepted.error).toBeNull();
    expect(accepted.data).toBe(clinicId);
    expect(await membershipOf(bela, clinicId)).toMatchObject({ role: "vet", is_clinician: true, status: "active" });

    const again = await bela.client.rpc("accept_invitation", { p_token: invitationToken });
    expect(again.error?.message).toBe("invitation_already_accepted");
  });

  test("an existing member cannot be invited again", async () => {
    const { error } = await anna.client.rpc("create_invitation", {
      p_organization_id: clinicId,
      p_email: bela.email,
      p_role: "assistant",
    });
    expect(error?.message).toBe("already_member");
  });

  test("a revoked invitation cannot be accepted", async () => {
    const invited = await anna.client.rpc("create_invitation", {
      p_organization_id: clinicId,
      p_email: cili.email,
      p_role: "receptionist",
    });
    expect(invited.error).toBeNull();

    const revoked = await anna.client.rpc("revoke_invitation", { p_invitation_id: invited.data![0].invitation_id });
    expect(revoked.error).toBeNull();

    const { error } = await cili.client.rpc("accept_invitation", { p_token: invited.data![0].token });
    expect(error?.message).toBe("invitation_revoked");
  });
});

describe("members and roles", () => {
  test("a new member sees the clinic and their colleagues", async () => {
    const organizations = await bela.client.from("organizations").select("id").eq("id", clinicId);
    expect(organizations.data).toHaveLength(1);

    const colleagues = await bela.client.from("profiles").select("id").eq("id", anna.id);
    expect(colleagues.data).toHaveLength(1);
  });

  test("a veterinarian cannot manage the clinic", async () => {
    await bela.client.from("organizations").update({ name: "Átnevezve" }).eq("id", clinicId);
    const { data } = await admin.from("organizations").select("name").eq("id", clinicId).single();
    expect(data?.name).toBe(`Teszt Rendelő ${runId}`);

    const invite = await bela.client.rpc("create_invitation", {
      p_organization_id: clinicId,
      p_email: cili.email,
      p_role: "assistant",
    });
    expect(invite.error?.message).toBe("forbidden");

    const annaMembership = await membershipOf(anna, clinicId);
    const demote = await bela.client.rpc("update_member", { p_membership_id: annaMembership.id, p_role: "assistant" });
    expect(demote.error?.message).toBe("forbidden");
  });

  test("the last owner cannot be demoted, suspended or removed", async () => {
    const { id } = await membershipOf(anna, clinicId);

    const demote = await anna.client.rpc("update_member", { p_membership_id: id, p_role: "admin" });
    expect(demote.error?.message).toBe("last_owner");

    const suspend = await anna.client.rpc("set_member_status", { p_membership_id: id, p_status: "suspended" });
    expect(suspend.error?.message).toBe("last_owner");

    const remove = await anna.client.rpc("remove_member", { p_membership_id: id });
    expect(remove.error?.message).toBe("last_owner");
  });

  test("with a second owner, the first one can step down – and then cannot touch owners", async () => {
    const annaMembership = await membershipOf(anna, clinicId);
    const belaMembership = await membershipOf(bela, clinicId);

    const promote = await anna.client.rpc("update_member", {
      p_membership_id: belaMembership.id,
      p_role: "owner",
      p_is_clinician: true,
    });
    expect(promote.error).toBeNull();
    expect(await membershipOf(bela, clinicId)).toMatchObject({ role: "owner", is_clinician: true });

    const stepDown = await anna.client.rpc("update_member", { p_membership_id: annaMembership.id, p_role: "admin" });
    expect(stepDown.error).toBeNull();
    expect(await membershipOf(anna, clinicId)).toMatchObject({ role: "admin", is_clinician: false });

    const demoteOwner = await anna.client.rpc("update_member", { p_membership_id: belaMembership.id, p_role: "vet" });
    expect(demoteOwner.error?.message).toBe("forbidden");
  });

  test("a suspended member loses access immediately", async () => {
    const annaMembership = await membershipOf(anna, clinicId);

    const suspend = await bela.client.rpc("set_member_status", {
      p_membership_id: annaMembership.id,
      p_status: "suspended",
    });
    expect(suspend.error).toBeNull();

    const organizations = await anna.client.from("organizations").select("id").eq("id", clinicId);
    expect(organizations.data).toEqual([]);

    // She can still see her own membership row, so the app can explain why.
    const own = await anna.client.from("memberships").select("status").eq("id", annaMembership.id);
    expect(own.data).toEqual([{ status: "suspended" }]);
  });

  test("a removed member is gone, and can no longer see the clinic", async () => {
    const annaMembership = await membershipOf(anna, clinicId);

    const remove = await bela.client.rpc("remove_member", { p_membership_id: annaMembership.id });
    expect(remove.error).toBeNull();

    const { data } = await admin.from("memberships").select("user_id").eq("organization_id", clinicId);
    expect(data).toEqual([{ user_id: bela.id }]);
  });
});
