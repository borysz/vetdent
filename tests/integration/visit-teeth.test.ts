import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The dental chart of a visit (one record per tooth), verified against the
 * real database: which teeth exist in which species, which marks are valid
 * together, merging of two devices, and the lock on a final visit.
 *
 *   olga  – owner of the clinic
 *   vera  – vet (may finalise)
 *   aron  – assistant (may write)
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

type Rpc = "sync_push_clients" | "sync_push_patients" | "sync_push_visits" | "sync_push_visit_teeth";

async function push(rpc: Rpc, user: TestUser, organizationId: string, changes: object[]) {
  const { data, error } = await user.client.rpc(rpc, { p_organization_id: organizationId, p_changes: changes as never });
  if (error) throw new Error(error.message);
  return data as unknown as PushResult[];
}

const pushTeeth = (user: TestUser, changes: object[], organizationId: string = clinicId) =>
  push("sync_push_visit_teeth", user, organizationId, changes);

async function toothRow(id: string) {
  const { data, error } = await admin.from("visit_teeth").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

const list = (items: object[]) => JSON.stringify(items);
const finding = (code: string, level = "") => ({ code, level });
const procedure = (code: string, level = "", state = "done") => ({ code, level, state });

let olga: TestUser;
let vera: TestUser;
let aron: TestUser;
let emil: TestUser;
let clinicId: string;
let emilOrgId: string;
let dogVisit: string;
let catVisit: string;
let foreignVisit: string;

async function newVisit(user: TestUser, organizationId: string, patientId: string, fields: Record<string, unknown> = {}) {
  const id = randomUUID();
  const [result] = await push("sync_push_visits", user, organizationId, [
    upsert(id, null, { patient_id: patientId, visit_date: "2026-11-16", ...fields }),
  ]);
  expect(result.status).toBe("applied");
  return id;
}

async function newPatient(user: TestUser, organizationId: string, ownerId: string, species: "dog" | "cat") {
  const id = randomUUID();
  await push("sync_push_patients", user, organizationId, [upsert(id, null, { client_id: ownerId, name: "Teszt", species })]);
  return id;
}

beforeAll(async () => {
  [olga, vera, aron, emil] = await Promise.all([
    createTestUser("olga"),
    createTestUser("vera"),
    createTestUser("aron"),
    createTestUser("emil"),
  ]);

  const clinic = await olga.client.rpc("create_organization", {
    p_type: "clinic",
    p_name: `Fogkep Teszt ${runId}`,
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
  dogVisit = await newVisit(aron, clinicId, await newPatient(olga, clinicId, ownerId, "dog"));
  catVisit = await newVisit(aron, clinicId, await newPatient(olga, clinicId, ownerId, "cat"));

  const foreignOwner = randomUUID();
  await push("sync_push_clients", emil, emilOrgId, [upsert(foreignOwner, null, { full_name: "Idegen" })]);
  foreignVisit = await newVisit(emil, emilOrgId, await newPatient(emil, emilOrgId, foreignOwner, "dog"));
});

afterAll(async () => {
  if (organizationIds.length > 0) {
    await admin.from("organizations").delete().in("id", organizationIds);
  }
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe("charting a tooth", () => {
  const id = randomUUID();

  test("is stored with the lists as real arrays", async () => {
    const [result] = await pushTeeth(aron, [
      upsert(id, null, {
        visit_id: dogVisit,
        tooth: 108,
        findings: list([finding("T", "2"), finding("PD", "3")]),
        procedures: list([procedure("U"), procedure("POL", "", "planned")]),
        pockets: JSON.stringify([3, 5, 3, null, 2, 4]),
        note: "  óvatosan  ",
      }),
    ]);
    expect(result).toMatchObject({ id, status: "applied", rev: 1 });

    expect(await toothRow(id)).toMatchObject({
      visit_id: dogVisit,
      tooth: 108,
      findings: [finding("T", "2"), finding("PD", "3")],
      procedures: [procedure("U"), procedure("POL", "", "planned")],
      pockets: [3, 5, 3, null, 2, 4],
      note: "óvatosan",
    });
  });

  test("members read it, outsiders do not", async () => {
    expect((await vera.client.from("visit_teeth").select("id").eq("id", id)).data).toHaveLength(1);
    expect((await emil.client.from("visit_teeth").select("id").eq("id", id)).data).toEqual([]);
  });

  test("the same tooth of the same visit cannot be recorded twice under different ids", async () => {
    const [result] = await pushTeeth(aron, [upsert(randomUUID(), null, { visit_id: dogVisit, tooth: 108 })]);
    expect(result.status).toBe("invalid");
  });

  test("the visit and the tooth cannot change afterwards", async () => {
    const results = await pushTeeth(aron, [
      upsert(id, 1, { tooth: 109 }),
      upsert(id, 1, { visit_id: catVisit }),
    ]);
    expect(results.map((result) => result.status)).toEqual(["invalid", "invalid"]);
    expect(await toothRow(id)).toMatchObject({ tooth: 108, visit_id: dogVisit });
  });

  test("a tooth cannot be deleted; clearing it empties the lists", async () => {
    const [refused] = await pushTeeth(aron, [{ id, op: "delete", base_rev: 1, fields: {} }]);
    expect(refused.status).toBe("invalid");

    const [cleared] = await pushTeeth(aron, [upsert(id, 1, { findings: "[]", procedures: "[]", pockets: "[]" })]);
    expect(cleared.status).toBe("applied");
    expect(await toothRow(id)).toMatchObject({ findings: [], procedures: [], pockets: [] });
  });
});

describe("which teeth exist", () => {
  const attempt = (visit: string, tooth: number) =>
    pushTeeth(aron, [upsert(randomUUID(), null, { visit_id: visit, tooth })]).then(([result]) => result.status);

  test("a dog has 42 teeth: 111 does not exist, 411 does", async () => {
    expect(await attempt(dogVisit, 110)).toBe("applied");
    expect(await attempt(dogVisit, 111)).toBe("invalid");
    expect(await attempt(dogVisit, 311)).toBe("applied");
    expect(await attempt(dogVisit, 100)).toBe("invalid");
    expect(await attempt(dogVisit, 512)).toBe("invalid");
  });

  test("a cat lacks 105, 305, 306 and 410, and has no 110", async () => {
    expect(await attempt(catVisit, 106)).toBe("applied");
    expect(await attempt(catVisit, 105)).toBe("invalid");
    expect(await attempt(catVisit, 305)).toBe("invalid");
    expect(await attempt(catVisit, 306)).toBe("invalid");
    expect(await attempt(catVisit, 409)).toBe("applied");
    expect(await attempt(catVisit, 410)).toBe("invalid");
    expect(await attempt(catVisit, 110)).toBe("invalid");
  });
});

describe("which marks are valid", () => {
  const create = (visit: string, tooth: number, fields: Record<string, unknown>) =>
    pushTeeth(aron, [upsert(randomUUID(), null, { visit_id: visit, tooth, ...fields })]).then(([result]) => result.status);

  test("a resorptive lesion is for cats only", async () => {
    expect(await create(dogVisit, 201, { findings: list([finding("RES", "2")]) })).toBe("invalid");
    expect(await create(catVisit, 201, { findings: list([finding("RES", "2")]) })).toBe("applied");
  });

  test("unknown codes, grades and states are refused", async () => {
    expect(await create(dogVisit, 202, { findings: list([finding("T", "4")]) })).toBe("invalid");
    expect(await create(dogVisit, 202, { findings: list([finding("XYZ")]) })).toBe("invalid");
    expect(await create(dogVisit, 202, { findings: list([finding("T", "1"), finding("T", "2")]) })).toBe("invalid");
    expect(await create(dogVisit, 202, { procedures: list([procedure("EXT", "S", "maybe")]) })).toBe("invalid");
    expect(await create(dogVisit, 202, { procedures: list([procedure("EXT", "DEEP")]) })).toBe("invalid");
    expect(await create(dogVisit, 202, { findings: "not json" })).toBe("invalid");
  });

  test("a missing tooth carries nothing else; a healthy tooth carries no other finding", async () => {
    expect(await create(dogVisit, 203, { findings: list([finding("M", "missing"), finding("T", "1")]) })).toBe("invalid");
    expect(await create(dogVisit, 203, { findings: list([finding("M", "prev")]), procedures: list([procedure("U")]) })).toBe("invalid");
    expect(await create(dogVisit, 203, { findings: list([finding("M", "imp")]) })).toBe("applied");
    expect(await create(dogVisit, 204, { findings: list([finding("0"), finding("G", "1")]) })).toBe("invalid");
    expect(await create(dogVisit, 204, { findings: list([finding("0")]), procedures: list([procedure("U")]) })).toBe("applied");
  });

  test("a combination made valid only by merging two edits is also checked", async () => {
    const id = randomUUID();
    await pushTeeth(aron, [upsert(id, null, { visit_id: dogVisit, tooth: 205, findings: list([finding("M", "missing")]) })]);
    const [result] = await pushTeeth(vera, [upsert(id, 1, { procedures: list([procedure("EXT", "S")]) })]);
    expect(result.status).toBe("invalid");
  });

  test("pocket depths: six points of 0 to 12 mm, or nothing", async () => {
    expect(await create(dogVisit, 206, { pockets: JSON.stringify([1, 2, 3]) })).toBe("invalid");
    expect(await create(dogVisit, 206, { pockets: JSON.stringify([1, 2, 3, 4, 5, 13]) })).toBe("invalid");
    expect(await create(dogVisit, 206, { pockets: JSON.stringify([1, 2, 3, 4, 5, 2.5]) })).toBe("invalid");
    expect(await create(dogVisit, 206, { pockets: JSON.stringify([0, 12, null, null, null, null]) })).toBe("applied");
  });

  test("a tooth of a visit of another organization, or an unknown visit, is refused", async () => {
    expect(await create(foreignVisit, 101, {})).toBe("invalid");
    expect(await create(randomUUID(), 101, {})).toBe("invalid");
  });
});

describe("two devices charting one tooth", () => {
  test("different fields are both kept; the same field keeps the later write and records the other", async () => {
    const id = randomUUID();
    await pushTeeth(aron, [upsert(id, null, { visit_id: dogVisit, tooth: 207 })]);

    await pushTeeth(aron, [upsert(id, 1, { note: "asszisztens", findings: list([finding("T", "1")]) })]);
    const [result] = await pushTeeth(vera, [upsert(id, 1, { note: "orvos", pockets: JSON.stringify([3, 3, 3, 3, 3, 3]) })]);
    expect(result).toMatchObject({ status: "applied", conflicts: 1 });

    expect(await toothRow(id)).toMatchObject({
      note: "orvos",
      findings: [finding("T", "1")],
      pockets: [3, 3, 3, 3, 3, 3],
    });
    const { data } = await admin.from("sync_conflicts").select("field, overwritten_value").eq("record_id", id);
    expect(data).toEqual([{ field: "note", overwritten_value: "asszisztens" }]);
  });
});

describe("a final visit", () => {
  test("its teeth are not edited; the edit is kept and answered as locked", async () => {
    const visit = await newVisit(aron, clinicId, await patientOf(dogVisit), { veterinarian_name: "Dr. Vera", asa_status: 2 });
    const tooth = randomUUID();
    await pushTeeth(aron, [upsert(tooth, null, { visit_id: visit, tooth: 104, findings: list([finding("T", "1")]) })]);

    const done = await vera.client.rpc("finalize_visit", { p_organization_id: clinicId, p_visit_id: visit });
    expect(done.error).toBeNull();

    // A late edit from a device that was offline, and a tooth that was never sent before.
    const lateNew = randomUUID();
    const results = await pushTeeth(aron, [
      upsert(tooth, 1, { findings: list([finding("PD", "3")]), note: "késői" }),
      upsert(lateNew, null, { visit_id: visit, tooth: 204, findings: list([finding("G", "1")]) }),
    ]);
    expect(results.map((result) => result.status)).toEqual(["locked", "locked"]);

    expect((await toothRow(tooth)).findings).toEqual([finding("T", "1")]);
    expect((await admin.from("visit_teeth").select("id").eq("id", lateNew)).data).toEqual([]);

    const { data } = await admin.from("sync_conflicts").select("field, overwritten_value, applied_value").eq("record_id", tooth).order("field");
    expect(data).toEqual([
      { field: "findings", overwritten_value: [finding("PD", "3")], applied_value: [finding("T", "1")] },
      { field: "note", overwritten_value: "késői", applied_value: null },
    ]);
  });

  test("after the visit is reopened its teeth can be edited again", async () => {
    const visit = await newVisit(aron, clinicId, await patientOf(dogVisit), { veterinarian_name: "Dr. Vera", asa_status: 2 });
    const tooth = randomUUID();
    await pushTeeth(aron, [upsert(tooth, null, { visit_id: visit, tooth: 104 })]);
    await vera.client.rpc("finalize_visit", { p_organization_id: clinicId, p_visit_id: visit });
    await vera.client.rpc("reopen_visit", { p_organization_id: clinicId, p_visit_id: visit, p_reason: "javítás" });

    const [result] = await pushTeeth(aron, [upsert(tooth, 1, { note: "javítva" })]);
    expect(result.status).toBe("applied");
  });
});

describe("who may write", () => {
  test("an outsider cannot write into someone else's organization", async () => {
    const { error } = await emil.client.rpc("sync_push_visit_teeth", {
      p_organization_id: clinicId,
      p_changes: [upsert(randomUUID(), null, { visit_id: dogVisit, tooth: 101 })] as never,
    });
    expect(error?.message).toBe("forbidden");
  });
});

async function patientOf(visitId: string): Promise<string> {
  const { data, error } = await admin.from("visits").select("patient_id").eq("id", visitId).single();
  if (error) throw error;
  return data.patient_id;
}
