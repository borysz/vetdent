import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Visits (treatment records), verified against the real database: cleaning of
 * values, the link to the patient, the draft -> final life cycle with its
 * permissions, and what happens to an edit that arrives for a final visit.
 *
 *   olga  – owner of the clinic (not a clinician)
 *   vera  – vet (may finalise and reopen)
 *   aron  – assistant (may write, may not finalise)
 *   emil  – owner of another organization
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

interface PushResult {
  id: string;
  status: string;
  rev?: number;
  conflicts?: number;
}

const runId = randomUUID().slice(0, 8);
const userIds: string[] = [];
const organizationIds: string[] = [];

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

const upsert = (id: string, baseRev: number | null, fields: Record<string, unknown>) => ({
  id,
  op: "upsert",
  base_rev: baseRev,
  fields,
});

async function push(rpc: "sync_push_clients" | "sync_push_patients" | "sync_push_visits", user: TestUser, organizationId: string, changes: object[]) {
  const { data, error } = await user.client.rpc(rpc, { p_organization_id: organizationId, p_changes: changes as never });
  if (error) throw new Error(error.message);
  return data as unknown as PushResult[];
}

const pushVisits = (user: TestUser, organizationId: string, changes: object[]) => push("sync_push_visits", user, organizationId, changes);

async function visitRow(id: string) {
  const { data, error } = await admin.from("visits").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

async function newDraft(user: TestUser, fields: Record<string, unknown> = {}): Promise<string> {
  const id = randomUUID();
  const [result] = await pushVisits(user, clinicId, [upsert(id, null, { patient_id: patientId, visit_date: "2026-11-16", ...fields })]);
  expect(result.status).toBe("applied");
  return id;
}

let olga: TestUser;
let vera: TestUser;
let aron: TestUser;
let emil: TestUser;
let clinicId: string;
let emilOrgId: string;
let patientId: string;
let foreignPatientId: string;

beforeAll(async () => {
  [olga, vera, aron, emil] = await Promise.all([
    createTestUser("olga"),
    createTestUser("vera"),
    createTestUser("aron"),
    createTestUser("emil"),
  ]);

  const clinic = await olga.client.rpc("create_organization", {
    p_type: "clinic",
    p_name: `Vizit Teszt ${runId}`,
    p_tax_number: "12345678-1-42",
  });
  if (clinic.error) throw clinic.error;
  clinicId = clinic.data;
  organizationIds.push(clinicId);
  await invite(olga, clinicId, vera, "vet");
  await invite(olga, clinicId, aron, "assistant");

  const own = await emil.client.rpc("create_organization", { p_type: "individual", p_name: "Dr. Teszt Emil" });
  if (own.error) throw own.error;
  emilOrgId = own.data;
  organizationIds.push(emilOrgId);

  const ownerId = randomUUID();
  await push("sync_push_clients", olga, clinicId, [upsert(ownerId, null, { full_name: "Gazdi Gizi" })]);
  patientId = randomUUID();
  await push("sync_push_patients", olga, clinicId, [
    upsert(patientId, null, { client_id: ownerId, name: "Bodri", species: "dog" }),
  ]);

  const foreignOwner = randomUUID();
  await push("sync_push_clients", emil, emilOrgId, [upsert(foreignOwner, null, { full_name: "Idegen Gazdi" })]);
  foreignPatientId = randomUUID();
  await push("sync_push_patients", emil, emilOrgId, [
    upsert(foreignPatientId, null, { client_id: foreignOwner, name: "Idegen", species: "cat" }),
  ]);
});

afterAll(async () => {
  if (organizationIds.length > 0) {
    await admin.from("organizations").delete().in("id", organizationIds);
  }
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe("creating a visit", () => {
  const id = randomUUID();

  test("is stored as a draft, with the values cleaned up and the lists as real arrays", async () => {
    const [result] = await pushVisits(aron, clinicId, [
      upsert(id, null, {
        patient_id: patientId,
        visit_date: "2026-11-16",
        veterinarian_name: "  Dr. Kiss ",
        asa_status: 2,
        last_fed_at: "2026-11-15T20:30",
        weight_kg: 18.456,
        complaint_tags: JSON.stringify(["pain", "halitosis"]),
        anesthesia_blocks: JSON.stringify([{ nerve: "n. infraorbitalis", side: "left", agent: "bupivakain", dose: "0,2 ml" }]),
        medications: JSON.stringify([{ name: "Meloxicam", dose: "0,1 mg/kg", frequency: "naponta", duration: "5 nap" }]),
        follow_up_date: "2026-11-28",
      }),
    ]);
    expect(result).toMatchObject({ id, status: "applied", rev: 1 });

    expect(await visitRow(id)).toMatchObject({
      status: "draft",
      patient_id: patientId,
      visit_date: "2026-11-16",
      veterinarian_name: "Dr. Kiss",
      asa_status: 2,
      last_fed_at: "2026-11-15T20:30:00",
      weight_kg: 18.46,
      complaint_tags: ["pain", "halitosis"],
      anesthesia_blocks: [{ nerve: "n. infraorbitalis", side: "left", agent: "bupivakain", dose: "0,2 ml" }],
      medications: [{ name: "Meloxicam", dose: "0,1 mg/kg", frequency: "naponta", duration: "5 nap" }],
      follow_up_date: "2026-11-28",
      ready_to_finalize: false,
      finalized_at: null,
    });
  });

  test("members read it, outsiders do not", async () => {
    expect((await vera.client.from("visits").select("id").eq("id", id)).data).toHaveLength(1);
    expect((await emil.client.from("visits").select("id").eq("id", id)).data).toEqual([]);
  });

  test("the patient and the date are required", async () => {
    const results = await pushVisits(aron, clinicId, [
      upsert(randomUUID(), null, { visit_date: "2026-11-16" }),
      upsert(randomUUID(), null, { patient_id: patientId }),
    ]);
    expect(results.map((result) => result.status)).toEqual(["invalid", "invalid"]);
  });

  test("a patient of another organization, or an unknown one, is refused", async () => {
    const results = await pushVisits(aron, clinicId, [
      upsert(randomUUID(), null, { patient_id: foreignPatientId, visit_date: "2026-11-16" }),
      upsert(randomUUID(), null, { patient_id: randomUUID(), visit_date: "2026-11-16" }),
    ]);
    expect(results.map((result) => result.status)).toEqual(["invalid", "invalid"]);
  });

  test("impossible values are refused", async () => {
    const bad = (fields: Record<string, unknown>) =>
      upsert(randomUUID(), null, { patient_id: patientId, visit_date: "2026-11-16", ...fields });
    const results = await pushVisits(aron, clinicId, [
      bad({ asa_status: 6 }),
      bad({ asa_status: 2.5 }),
      bad({ visit_date: "2030-01-01" }),
      bad({ visit_date: "1999-12-31" }),
      bad({ weight_kg: 0 }),
      bad({ last_fed_at: "yesterday" }),
      bad({ complaint_tags: JSON.stringify(["nonsense"]) }),
      bad({ complaint_tags: "not json" }),
      bad({ anesthesia_blocks: JSON.stringify([{ nerve: "x", surprise: "y" }]) }),
      bad({ medications: JSON.stringify([{ name: "" }]) }),
      bad({ follow_up_date: "2099-01-01" }),
    ]);
    expect(results.map((result) => result.status)).toEqual(Array(11).fill("invalid"));
  });

  test("the general note is cleaned, and limited to 2000 characters", async () => {
    const noted = randomUUID();
    const [ok] = await pushVisits(aron, clinicId, [
      upsert(noted, null, { patient_id: patientId, visit_date: "2026-11-16", general_note: "  Sipolynyílás a 104-es foggyökérnél  " }),
    ]);
    expect(ok.status).toBe("applied");
    expect((await visitRow(noted)).general_note).toBe("Sipolynyílás a 104-es foggyökérnél");

    const [tooLong] = await pushVisits(aron, clinicId, [upsert(noted, 1, { general_note: "x".repeat(2001) })]);
    expect(tooLong.status).toBe("invalid");
  });

  test("the patient of a visit cannot be changed afterwards", async () => {
    const [result] = await pushVisits(aron, clinicId, [upsert(id, 1, { patient_id: randomUUID() })]);
    expect(result.status).toBe("invalid");
    expect((await visitRow(id)).patient_id).toBe(patientId);
  });
});

describe("two devices editing one visit", () => {
  test("different fields are both kept; the same field keeps the later write and records the other", async () => {
    const id = await newDraft(aron);

    await pushVisits(aron, clinicId, [upsert(id, 1, { diet_type: "száraztáp" })]);
    // vera started from revision 1 too, so her edit of another field merges, and the same field conflicts.
    const [result] = await pushVisits(vera, clinicId, [upsert(id, 1, { diet_type: "nedves táp", sutures: "6-0 Monocryl" })]);
    expect(result).toMatchObject({ status: "applied", conflicts: 1 });

    expect(await visitRow(id)).toMatchObject({ diet_type: "nedves táp", sutures: "6-0 Monocryl" });
    const { data } = await admin.from("sync_conflicts").select("field, overwritten_value").eq("record_id", id);
    expect(data).toEqual([{ field: "diet_type", overwritten_value: "száraztáp" }]);
  });
});

describe("finalising a visit", () => {
  test("only someone with the clinical right may; an assistant and a non-clinician owner may not", async () => {
    const id = await newDraft(aron, { veterinarian_name: "Dr. Vera", asa_status: 1 });

    for (const user of [aron, olga]) {
      const { error } = await user.client.rpc("finalize_visit", { p_organization_id: clinicId, p_visit_id: id });
      expect(error?.message).toBe("forbidden");
    }
    expect((await visitRow(id)).status).toBe("draft");
  });

  test("needs the treating vet and the ASA status", async () => {
    const id = await newDraft(aron);
    const { error } = await vera.client.rpc("finalize_visit", { p_organization_id: clinicId, p_visit_id: id });
    expect(error?.message).toBe("missing_required");
    expect((await visitRow(id)).status).toBe("draft");
  });

  test("locks the visit and is written to the audit log", async () => {
    const id = await newDraft(aron, { veterinarian_name: "Dr. Vera", asa_status: 2, ready_to_finalize: true });
    const done = await vera.client.rpc("finalize_visit", { p_organization_id: clinicId, p_visit_id: id });
    expect(done.error).toBeNull();

    expect(await visitRow(id)).toMatchObject({ status: "final", finalized_by: vera.id, ready_to_finalize: false });
    const { data } = await admin
      .from("audit_log")
      .select("action, actor_id, target_id")
      .eq("organization_id", clinicId)
      .eq("action", "visit.finalized")
      .eq("target_id", id);
    expect(data).toEqual([{ action: "visit.finalized", actor_id: vera.id, target_id: id }]);

    const again = await vera.client.rpc("finalize_visit", { p_organization_id: clinicId, p_visit_id: id });
    expect(again.error?.message).toBe("already_final");
  });

  test("an edit that arrives for a final visit is not applied, answered as locked, and kept", async () => {
    const id = await newDraft(aron, { veterinarian_name: "Dr. Vera", asa_status: 2, sutures: "eredeti" });
    await vera.client.rpc("finalize_visit", { p_organization_id: clinicId, p_visit_id: id });
    const rev = (await visitRow(id)).rev;

    // aron's device was offline while the visit was finalised and now sends a late edit.
    const [result] = await pushVisits(aron, clinicId, [upsert(id, 1, { sutures: "késői módosítás", diet_type: "pép" })]);
    expect(result).toMatchObject({ status: "locked", conflicts: 2 });

    expect(await visitRow(id)).toMatchObject({ sutures: "eredeti", diet_type: null, rev });
    const { data } = await admin.from("sync_conflicts").select("field, overwritten_value, applied_value").eq("record_id", id).order("field");
    expect(data).toEqual([
      { field: "diet_type", overwritten_value: "pép", applied_value: null },
      { field: "sutures", overwritten_value: "késői módosítás", applied_value: "eredeti" },
    ]);
  });

  test("a final visit cannot be deleted from a device", async () => {
    const id = await newDraft(aron, { veterinarian_name: "Dr. Vera", asa_status: 2 });
    await vera.client.rpc("finalize_visit", { p_organization_id: clinicId, p_visit_id: id });

    const [result] = await pushVisits(aron, clinicId, [{ id, op: "delete", base_rev: 2, fields: {} }]);
    expect(result.status).toBe("forbidden");
    expect((await visitRow(id)).deleted_at).toBeNull();
  });

  test("a visit of another organization is not found", async () => {
    const id = await newDraft(aron, { veterinarian_name: "Dr. Vera", asa_status: 2 });
    const { error } = await emil.client.rpc("finalize_visit", { p_organization_id: emilOrgId, p_visit_id: id });
    expect(error?.message).toBe("visit_not_found");
  });
});

describe("reopening a visit", () => {
  async function finalVisit(): Promise<string> {
    const id = await newDraft(aron, { veterinarian_name: "Dr. Vera", asa_status: 2 });
    const done = await vera.client.rpc("finalize_visit", { p_organization_id: clinicId, p_visit_id: id });
    expect(done.error).toBeNull();
    return id;
  }

  test("needs the right and a reason", async () => {
    const id = await finalVisit();

    const assistant = await aron.client.rpc("reopen_visit", { p_organization_id: clinicId, p_visit_id: id, p_reason: "elírás" });
    expect(assistant.error?.message).toBe("forbidden");

    for (const reason of ["", "  ", "ab"]) {
      const { error } = await vera.client.rpc("reopen_visit", { p_organization_id: clinicId, p_visit_id: id, p_reason: reason });
      expect(error?.message).toBe("reason_required");
    }
    expect((await visitRow(id)).status).toBe("final");
  });

  test("makes it a draft again, writes the reason to the audit log, and allows edits", async () => {
    const id = await finalVisit();
    const { error } = await vera.client.rpc("reopen_visit", {
      p_organization_id: clinicId,
      p_visit_id: id,
      p_reason: "  A kontroll időpontját javítani kell  ",
    });
    expect(error).toBeNull();

    expect(await visitRow(id)).toMatchObject({ status: "draft", finalized_at: null, finalized_by: null });
    const { data } = await admin
      .from("audit_log")
      .select("details")
      .eq("organization_id", clinicId)
      .eq("action", "visit.reopened")
      .eq("target_id", id);
    expect(data?.[0].details).toMatchObject({ reason: "A kontroll időpontját javítani kell" });

    const rev = (await visitRow(id)).rev;
    const [edit] = await pushVisits(aron, clinicId, [upsert(id, rev, { follow_up_date: "2026-11-30" })]);
    expect(edit.status).toBe("applied");
  });

  test("a draft cannot be reopened", async () => {
    const id = await newDraft(aron);
    const { error } = await vera.client.rpc("reopen_visit", { p_organization_id: clinicId, p_visit_id: id, p_reason: "nincs lezárva" });
    expect(error?.message).toBe("not_final");
  });
});

describe("who may write visits", () => {
  test("a receptionist-less outsider cannot write into someone else's organization", async () => {
    const { error } = await emil.client.rpc("sync_push_visits", {
      p_organization_id: clinicId,
      p_changes: [upsert(randomUUID(), null, { patient_id: patientId, visit_date: "2026-11-16" })] as never,
    });
    expect(error?.message).toBe("forbidden");
  });
});
