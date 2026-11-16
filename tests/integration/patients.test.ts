import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Patients (the animals), verified against the real database. They use the
 * same synchronisation contract as clients; the tests here cover what is
 * different: the owner link, the species, and the animal-specific fields.
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

async function pushPatients(user: TestUser, organizationId: string, changes: object[]): Promise<PushResult[]> {
  const { data, error } = await user.client.rpc("sync_push_patients", {
    p_organization_id: organizationId,
    p_changes: changes as never,
  });
  if (error) throw new Error(error.message);
  return data as unknown as PushResult[];
}

async function pushClients(user: TestUser, organizationId: string, changes: object[]): Promise<PushResult[]> {
  const { data, error } = await user.client.rpc("sync_push_clients", {
    p_organization_id: organizationId,
    p_changes: changes as never,
  });
  if (error) throw new Error(error.message);
  return data as unknown as PushResult[];
}

const upsert = (id: string, baseRev: number | null, fields: Record<string, unknown>) => ({
  id,
  op: "upsert",
  base_rev: baseRev,
  fields,
});

async function patientRow(id: string) {
  const { data, error } = await admin.from("patients").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

let dora: TestUser;
let emil: TestUser;
let clinicId: string;
let emilOrgId: string;
let ownerId: string;
let foreignOwnerId: string;

beforeAll(async () => {
  [dora, emil] = await Promise.all([createTestUser("dora"), createTestUser("emil")]);

  const clinic = await dora.client.rpc("create_organization", {
    p_type: "clinic",
    p_name: `Páciens Teszt ${runId}`,
    p_tax_number: "12345678-1-42",
  });
  if (clinic.error) throw clinic.error;
  clinicId = clinic.data;
  organizationIds.push(clinicId);

  const own = await emil.client.rpc("create_organization", { p_type: "individual", p_name: "Dr. Teszt Emil" });
  if (own.error) throw own.error;
  emilOrgId = own.data;
  organizationIds.push(emilOrgId);

  ownerId = randomUUID();
  foreignOwnerId = randomUUID();
  await pushClients(dora, clinicId, [upsert(ownerId, null, { full_name: "Gazdi Gizi" })]);
  await pushClients(emil, emilOrgId, [upsert(foreignOwnerId, null, { full_name: "Idegen Gazdi" })]);
});

afterAll(async () => {
  if (organizationIds.length > 0) {
    await admin.from("organizations").delete().in("id", organizationIds);
  }
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe("creating a patient", () => {
  const id = randomUUID();

  test("a patient is created for an existing client, with cleaned-up values", async () => {
    const [result] = await pushPatients(dora, clinicId, [
      upsert(id, null, {
        client_id: ownerId,
        name: "  Bodri ",
        species: "dog",
        breed: "keverék",
        birth_date: "2019-05-17",
        sex: "male",
        neutered: true,
        weight_kg: 18.456,
        microchip: "985112345678901",
      }),
    ]);
    expect(result).toMatchObject({ id, status: "applied", rev: 1 });

    expect(await patientRow(id)).toMatchObject({
      client_id: ownerId,
      name: "Bodri",
      species: "dog",
      breed: "keverék",
      birth_date: "2019-05-17",
      sex: "male",
      neutered: true,
      weight_kg: 18.46,
      microchip: "985112345678901",
    });
  });

  test("members read it, outsiders do not", async () => {
    const own = await dora.client.from("patients").select("id").eq("id", id);
    expect(own.data).toHaveLength(1);
    const outsider = await emil.client.from("patients").select("id").eq("id", id);
    expect(outsider.data).toEqual([]);
  });

  test("the name, species and owner are required", async () => {
    const results = await pushPatients(dora, clinicId, [
      upsert(randomUUID(), null, { client_id: ownerId, species: "dog" }),
      upsert(randomUUID(), null, { client_id: ownerId, name: "Fajtalan" }),
      upsert(randomUUID(), null, { name: "Gazdatlan", species: "cat" }),
    ]);
    expect(results.map((result) => result.status)).toEqual(["invalid", "invalid", "invalid"]);
  });

  test("only dogs and cats are accepted", async () => {
    const [result] = await pushPatients(dora, clinicId, [
      upsert(randomUUID(), null, { client_id: ownerId, name: "Mopsz", species: "rabbit" }),
    ]);
    expect(result.status).toBe("invalid");
  });

  test("the owner must be a client of the same organization", async () => {
    const [foreign, missing] = await pushPatients(dora, clinicId, [
      upsert(randomUUID(), null, { client_id: foreignOwnerId, name: "Idegen", species: "cat" }),
      upsert(randomUUID(), null, { client_id: randomUUID(), name: "Elveszett", species: "cat" }),
    ]);
    expect(foreign.status).toBe("invalid");
    expect(missing.status).toBe("invalid");
  });

  test("impossible values are refused: future birth date, odd weight, bad chip number", async () => {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const base = { client_id: ownerId, name: "Teszt", species: "cat" };
    const results = await pushPatients(dora, clinicId, [
      upsert(randomUUID(), null, { ...base, birth_date: tomorrow }),
      upsert(randomUUID(), null, { ...base, birth_date: "2020-13-45" }),
      upsert(randomUUID(), null, { ...base, weight_kg: -3 }),
      upsert(randomUUID(), null, { ...base, weight_kg: 500 }),
      upsert(randomUUID(), null, { ...base, microchip: "rövid" }),
      upsert(randomUUID(), null, { ...base, sex: "attack-helicopter" }),
    ]);
    expect(results.map((result) => result.status)).toEqual(Array(6).fill("invalid"));
  });

  test("a patient sent twice is stored once", async () => {
    const [again] = await pushPatients(dora, clinicId, [
      upsert(id, null, { client_id: ownerId, name: "Bodri", species: "dog" }),
    ]);
    expect(again.status).toBe("unchanged");
    const rows = await admin.from("patients").select("id").eq("id", id);
    expect(rows.data).toHaveLength(1);
  });
});

describe("editing", () => {
  const id = randomUUID();

  beforeAll(async () => {
    await pushPatients(dora, clinicId, [
      upsert(id, null, { client_id: ownerId, name: "Cirmi", species: "cat", weight_kg: 4.2, notes: "régi" }),
    ]);
  });

  test("two devices editing different fields both keep their edit", async () => {
    const [first] = await pushPatients(dora, clinicId, [upsert(id, 1, { weight_kg: 4.5 })]);
    const [second] = await pushPatients(dora, clinicId, [upsert(id, 1, { notes: "új megjegyzés" })]);
    expect(first).toMatchObject({ status: "applied", conflicts: 0 });
    expect(second).toMatchObject({ status: "applied", conflicts: 0 });
    expect(await patientRow(id)).toMatchObject({ weight_kg: 4.5, notes: "új megjegyzés", rev: 3 });
  });

  test("the same field on both devices: later wins, the overwritten value is kept", async () => {
    await pushPatients(dora, clinicId, [upsert(id, 3, { weight_kg: 4.8 })]);
    const [late] = await pushPatients(dora, clinicId, [upsert(id, 3, { weight_kg: 5.1 })]);
    expect(late).toMatchObject({ status: "applied", conflicts: 1 });

    const conflicts = await dora.client
      .from("sync_conflicts")
      .select("table_name, field, overwritten_value, applied_value")
      .eq("record_id", id);
    expect(conflicts.data).toEqual([
      { table_name: "patients", field: "weight_kg", overwritten_value: 4.8, applied_value: 5.1 },
    ]);
  });

  test("the species can never be changed", async () => {
    const [result] = await pushPatients(dora, clinicId, [upsert(id, 4, { species: "dog" })]);
    expect(result.status).toBe("invalid");
    expect((await patientRow(id)).species).toBe("cat");
  });

  test("a patient can be handed to another client of the same organization, but not to a foreign one", async () => {
    const newOwner = randomUUID();
    await pushClients(dora, clinicId, [upsert(newOwner, null, { full_name: "Új Gazdi" })]);

    const [moved] = await pushPatients(dora, clinicId, [upsert(id, 4, { client_id: newOwner })]);
    expect(moved.status).toBe("applied");
    expect((await patientRow(id)).client_id).toBe(newOwner);

    const [refused] = await pushPatients(dora, clinicId, [upsert(id, 5, { client_id: foreignOwnerId })]);
    expect(refused.status).toBe("invalid");
    expect((await patientRow(id)).client_id).toBe(newOwner);
  });

  test("optional fields can be cleared", async () => {
    const [result] = await pushPatients(dora, clinicId, [upsert(id, 5, { weight_kg: null, notes: "" })]);
    expect(result.status).toBe("applied");
    expect(await patientRow(id)).toMatchObject({ weight_kg: null, notes: null });
  });
});

describe("deleting and isolation", () => {
  test("a delete leaves a tombstone, and a later edit does not bring the patient back", async () => {
    const id = randomUUID();
    await pushPatients(dora, clinicId, [upsert(id, null, { client_id: ownerId, name: "Törlendő", species: "dog" })]);

    const [deleted] = await pushPatients(dora, clinicId, [{ id, op: "delete", base_rev: 1 }]);
    expect(deleted).toMatchObject({ status: "applied", rev: 2 });
    expect((await patientRow(id)).deleted_at).not.toBeNull();

    const [late] = await pushPatients(dora, clinicId, [upsert(id, 1, { name: "Feltámadt" })]);
    expect(late.status).toBe("deleted");
    expect((await patientRow(id)).name).toBe("Törlendő");
  });

  test("an id from another organization is refused, and nobody can write directly", async () => {
    const id = randomUUID();
    await pushPatients(emil, emilOrgId, [upsert(id, null, { client_id: foreignOwnerId, name: "Emil Kutyája", species: "dog" })]);

    const [taken] = await pushPatients(dora, clinicId, [upsert(id, 1, { name: "Elvéve" })]);
    expect(taken.status).toBe("forbidden");
    expect((await patientRow(id)).name).toBe("Emil Kutyája");

    const direct = await dora.client
      .from("patients")
      .insert({ id: randomUUID(), organization_id: clinicId, client_id: ownerId, name: "Közvetlen", species: "dog" });
    expect(direct.error).not.toBeNull();

    await expect(
      pushPatients(emil, clinicId, [upsert(randomUUID(), null, { client_id: ownerId, name: "Behatoló", species: "dog" })]),
    ).rejects.toThrow("forbidden");
  });
});
