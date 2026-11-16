import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * The synchronisation protocol for clients (gazdik), verified against the
 * real database. "Device A" and "device B" are simply two pushes that started
 * from the same revision.
 *
 *   sofi  – owns a clinic
 *   gabor – an assistant there (may write clients, may not delete them)
 *   rita  – an outsider with her own individual account
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
  status: "applied" | "unchanged" | "invalid" | "forbidden" | "deleted";
  rev?: number;
  conflicts?: number;
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

async function push(user: TestUser, organizationId: string, changes: object[]): Promise<PushResult[]> {
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

async function rowOf(id: string) {
  const { data, error } = await admin.from("clients").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

let sofi: TestUser;
let gabor: TestUser;
let rita: TestUser;
let clinicId: string;
let ritaOrgId: string;

beforeAll(async () => {
  [sofi, gabor, rita] = await Promise.all([createTestUser("sofi"), createTestUser("gabor"), createTestUser("rita")]);

  const clinic = await sofi.client.rpc("create_organization", {
    p_type: "clinic",
    p_name: `Szinkron Teszt ${runId}`,
    p_tax_number: "12345678-1-42",
  });
  if (clinic.error) throw clinic.error;
  clinicId = clinic.data;
  organizationIds.push(clinicId);

  const own = await rita.client.rpc("create_organization", { p_type: "individual", p_name: "Dr. Teszt Rita" });
  if (own.error) throw own.error;
  ritaOrgId = own.data;
  organizationIds.push(ritaOrgId);

  const invited = await sofi.client.rpc("create_invitation", {
    p_organization_id: clinicId,
    p_email: gabor.email,
    p_role: "assistant",
  });
  if (invited.error) throw invited.error;
  const accepted = await gabor.client.rpc("accept_invitation", { p_token: invited.data[0].token });
  if (accepted.error) throw accepted.error;
});

afterAll(async () => {
  if (organizationIds.length > 0) {
    await admin.from("organizations").delete().in("id", organizationIds);
  }
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe("creating records offline", () => {
  const id = randomUUID();

  test("a record created on a device keeps the id the device gave it", async () => {
    const [result] = await push(sofi, clinicId, [
      upsert(id, null, { full_name: "  Kovács Anna ", phone: "+36 30 111 2222", email: "Anna@Pelda.HU", email_consent: true }),
    ]);
    expect(result).toMatchObject({ id, status: "applied", rev: 1 });

    const row = await rowOf(id);
    expect(row).toMatchObject({
      full_name: "Kovács Anna",
      phone: "+36 30 111 2222",
      email: "anna@pelda.hu",
      email_consent: true,
      address: null,
      rev: 1,
      deleted_at: null,
    });
    expect(row.created_by).toBe(sofi.id);
  });

  test("sending the same creation again changes nothing", async () => {
    const [again] = await push(sofi, clinicId, [upsert(id, null, { full_name: "Kovács Anna" })]);
    expect(again.status).toBe("unchanged");
    expect((await rowOf(id)).rev).toBe(1);
  });

  test("organization members can read the record, outsiders cannot", async () => {
    const asAssistant = await gabor.client.from("clients").select("id, full_name").eq("id", id);
    expect(asAssistant.data).toEqual([{ id, full_name: "Kovács Anna" }]);

    const asOutsider = await rita.client.from("clients").select("id").eq("id", id);
    expect(asOutsider.data).toEqual([]);
  });

  test("nobody can write to the table directly", async () => {
    const insert = await sofi.client
      .from("clients")
      .insert({ id: randomUUID(), organization_id: clinicId, full_name: "Közvetlen" });
    expect(insert.error).not.toBeNull();

    await sofi.client.from("clients").update({ full_name: "Átírva" }).eq("id", id);
    await sofi.client.from("clients").delete().eq("id", id);
    expect((await rowOf(id)).full_name).toBe("Kovács Anna");
  });
});

describe("merging edits from two devices", () => {
  const id = randomUUID();

  beforeAll(async () => {
    await push(sofi, clinicId, [upsert(id, null, { full_name: "Nagy Béla", phone: "111", notes: "régi" })]);
  });

  test("edits to different fields are both kept, without a conflict", async () => {
    const [deviceA] = await push(sofi, clinicId, [upsert(id, 1, { phone: "222" })]);
    expect(deviceA).toMatchObject({ status: "applied", rev: 2, conflicts: 0 });

    // Device B started from revision 1 as well, and edits another field.
    const [deviceB] = await push(gabor, clinicId, [upsert(id, 1, { notes: "új megjegyzés" })]);
    expect(deviceB).toMatchObject({ status: "applied", rev: 3, conflicts: 0 });

    expect(await rowOf(id)).toMatchObject({ full_name: "Nagy Béla", phone: "222", notes: "új megjegyzés", rev: 3 });
  });

  test("the same field on both devices: the later write wins and the loser is kept", async () => {
    const [first] = await push(sofi, clinicId, [upsert(id, 3, { address: "Budapest, Fő utca 1." })]);
    expect(first.status).toBe("applied");

    // Device B never saw that edit (it still starts from revision 3).
    const [second] = await push(gabor, clinicId, [upsert(id, 3, { address: "Szeged, Kis utca 2." })]);
    expect(second).toMatchObject({ status: "applied", conflicts: 1 });

    expect((await rowOf(id)).address).toBe("Szeged, Kis utca 2.");

    const conflicts = await sofi.client
      .from("sync_conflicts")
      .select("field, overwritten_value, applied_value, resolved_at")
      .eq("record_id", id);
    expect(conflicts.data).toEqual([
      {
        field: "address",
        overwritten_value: "Budapest, Fő utca 1.",
        applied_value: "Szeged, Kis utca 2.",
        resolved_at: null,
      },
    ]);
  });

  test("a conflict can be read by members with write access, resolved by them, and not seen by outsiders", async () => {
    const open = await gabor.client.from("sync_conflicts").select("id").eq("record_id", id);
    expect(open.data).toHaveLength(1);

    const hidden = await rita.client.from("sync_conflicts").select("id").eq("record_id", id);
    expect(hidden.data).toEqual([]);

    const refused = await rita.client.rpc("resolve_sync_conflict", { p_conflict_id: open.data![0].id });
    expect(refused.error?.message).toBe("conflict_not_found");

    const resolved = await gabor.client.rpc("resolve_sync_conflict", { p_conflict_id: open.data![0].id });
    expect(resolved.error).toBeNull();
    const after = await admin.from("sync_conflicts").select("resolved_at, resolved_by").eq("id", open.data![0].id).single();
    expect(after.data?.resolved_at).not.toBeNull();
    expect(after.data?.resolved_by).toBe(gabor.id);
  });

  test("an edit that changes nothing is reported as unchanged and does not bump the revision", async () => {
    const before = (await rowOf(id)).rev;
    const [result] = await push(sofi, clinicId, [upsert(id, before, { full_name: "Nagy Béla", phone: "222" })]);
    expect(result.status).toBe("unchanged");
    expect((await rowOf(id)).rev).toBe(before);
  });

  test("a field can be cleared", async () => {
    const before = (await rowOf(id)).rev;
    const [result] = await push(sofi, clinicId, [upsert(id, before, { notes: "" })]);
    expect(result.status).toBe("applied");
    expect((await rowOf(id)).notes).toBeNull();
  });
});

describe("bad input", () => {
  test("invalid records are refused one by one, and valid ones in the same batch still go through", async () => {
    const good = randomUUID();
    const noName = randomUUID();
    const badEmail = randomUUID();
    const results = await push(sofi, clinicId, [
      upsert(noName, null, { full_name: "   " }),
      upsert(good, null, { full_name: "Jó Rekord" }),
      upsert(badEmail, null, { full_name: "Rossz Email", email: "nem-email" }),
      { id: "not-a-uuid", op: "upsert", fields: { full_name: "x" } },
    ]);

    expect(results.map((result) => result.status)).toEqual(["invalid", "applied", "invalid", "invalid"]);
    expect(results[0].id).toBe(noName);

    const rows = await admin.from("clients").select("id").in("id", [good, noName, badEmail]);
    expect(rows.data?.map((row) => row.id)).toEqual([good]);
  });

  test("fields the protocol does not know are ignored – they can never move a record or change its owner", async () => {
    const id = randomUUID();
    const [result] = await push(sofi, clinicId, [
      upsert(id, null, { full_name: "Mező Teszt", organization_id: ritaOrgId, rev: 99, deleted_at: "2020-01-01" }),
    ]);
    expect(result).toMatchObject({ status: "applied", rev: 1 });

    const row = await rowOf(id);
    expect(row.organization_id).toBe(clinicId);
    expect(row.rev).toBe(1);
    expect(row.deleted_at).toBeNull();
  });

  test("a wrong type is refused", async () => {
    const [result] = await push(sofi, clinicId, [
      upsert(randomUUID(), null, { full_name: "Típus Teszt", email_consent: "igen" }),
    ]);
    expect(result.status).toBe("invalid");
  });

  test("an over-long batch is refused", async () => {
    const changes = Array.from({ length: 201 }, () => upsert(randomUUID(), null, { full_name: "Sok" }));
    await expect(push(sofi, clinicId, changes)).rejects.toThrow("invalid_batch");
  });
});

describe("who may do what", () => {
  test("a record id that belongs to another organization is refused without a leak", async () => {
    const id = randomUUID();
    await push(rita, ritaOrgId, [upsert(id, null, { full_name: "Rita Gazdija" })]);

    const [result] = await push(sofi, clinicId, [upsert(id, 1, { full_name: "Elvéve" })]);
    expect(result).toEqual({ id, status: "forbidden" });
    expect((await rowOf(id)).full_name).toBe("Rita Gazdija");
    expect((await rowOf(id)).organization_id).toBe(ritaOrgId);
  });

  test("an outsider cannot push into someone else's organization", async () => {
    await expect(push(rita, clinicId, [upsert(randomUUID(), null, { full_name: "Behatoló" })])).rejects.toThrow(
      "forbidden",
    );
  });

  test("an anonymous visitor cannot push", async () => {
    const anonymous = createClient<Database>(url!, publishableKey!, stateless);
    const { error } = await anonymous.rpc("sync_push_clients", { p_organization_id: clinicId, p_changes: [] });
    expect(error).not.toBeNull();
  });
});

describe("deleting", () => {
  const id = randomUUID();

  beforeAll(async () => {
    await push(sofi, clinicId, [upsert(id, null, { full_name: "Törlendő Tamás" })]);
  });

  test("an assistant may not delete", async () => {
    const [result] = await push(gabor, clinicId, [{ id, op: "delete", base_rev: 1 }]);
    expect(result.status).toBe("forbidden");
    expect((await rowOf(id)).deleted_at).toBeNull();
  });

  test("an owner's delete leaves a tombstone that other devices can pull", async () => {
    const before = await rowOf(id);
    const [result] = await push(sofi, clinicId, [{ id, op: "delete", base_rev: 1 }]);
    expect(result).toMatchObject({ status: "applied", rev: 2 });

    const pulled = await gabor.client
      .from("clients")
      .select("id, rev, deleted_at, seq")
      .eq("organization_id", clinicId)
      .gt("seq", before.seq - 1)
      .eq("id", id);
    expect(pulled.data).toHaveLength(1);
    expect(pulled.data![0].deleted_at).not.toBeNull();
    expect(pulled.data![0].seq).toBeGreaterThan(before.seq);
  });

  test("an edit that arrives after the delete is reported as deleted, not resurrected", async () => {
    const [result] = await push(gabor, clinicId, [upsert(id, 1, { phone: "999" })]);
    expect(result).toMatchObject({ status: "deleted" });
    expect((await rowOf(id)).phone).toBeNull();
  });

  test("deleting twice is harmless", async () => {
    const [result] = await push(sofi, clinicId, [{ id, op: "delete", base_rev: 2 }]);
    expect(result.status).toBe("unchanged");
  });
});

describe("the change stream", () => {
  test("every change moves the record forward in the stream", async () => {
    const id = randomUUID();
    await push(sofi, clinicId, [upsert(id, null, { full_name: "Sorrend" })]);
    const first = (await rowOf(id)).seq;
    await push(sofi, clinicId, [upsert(id, 1, { phone: "1" })]);
    const second = (await rowOf(id)).seq;
    expect(second).toBeGreaterThan(first);

    const { data } = await sofi.client
      .from("clients")
      .select("id")
      .eq("organization_id", clinicId)
      .gt("seq", first)
      .order("seq")
      .limit(500);
    expect(data?.map((row) => row.id)).toContain(id);
  });
});

describe("read-only mode", () => {
  test("pushing is refused once the subscription has lapsed, and nothing is lost", async () => {
    const id = randomUUID();
    await push(sofi, clinicId, [upsert(id, null, { full_name: "Lejárat előtt" })]);

    const lapse = await admin
      .from("subscriptions")
      .update({ trial_ends_at: new Date(Date.now() - 86_400_000).toISOString() })
      .eq("organization_id", clinicId);
    expect(lapse.error).toBeNull();

    await expect(push(sofi, clinicId, [upsert(id, 1, { phone: "5" })])).rejects.toThrow("read_only");

    // Existing data is still readable.
    const read = await sofi.client.from("clients").select("id").eq("id", id);
    expect(read.data).toHaveLength(1);
  });
});
