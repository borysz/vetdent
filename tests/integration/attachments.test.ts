import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Attachments, verified against the real database and the real storage bucket:
 * who may upload and read, what a file may be, the storage allowance, how the
 * server takes size and type from the stored file, and the lock on a final visit.
 *
 *   olga  – owner of the clinic
 *   vera  – vet (may finalise)
 *   aron  – assistant (may upload)
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
const uploadedPaths: string[] = [];

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

type Rpc = "sync_push_clients" | "sync_push_patients" | "sync_push_visits" | "sync_push_attachments";

async function push(rpc: Rpc, user: TestUser, organizationId: string, changes: object[]) {
  const { data, error } = await user.client.rpc(rpc, { p_organization_id: organizationId, p_changes: changes as never });
  if (error) throw new Error(error.message);
  return data as unknown as PushResult[];
}

const pushAttachments = (user: TestUser, changes: object[], organizationId: string = clinicId) =>
  push("sync_push_attachments", user, organizationId, changes);

async function attachmentRow(id: string) {
  const { data, error } = await admin.from("attachments").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

// A real (tiny) PNG: 1x1 pixel.
const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64"),
);

async function uploadAs(user: TestUser, organizationId: string, id: string, body: Uint8Array = PNG, contentType = "image/png") {
  const path = `${organizationId}/${id}`;
  const result = await user.client.storage.from("attachments").upload(path, new Blob([body as unknown as BlobPart], { type: contentType }), { contentType, upsert: true });
  if (!result.error) uploadedPaths.push(path);
  return result;
}

let olga: TestUser;
let vera: TestUser;
let aron: TestUser;
let emil: TestUser;
let clinicId: string;
let emilOrgId: string;
let dogVisit: string;
let catVisit: string;

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

/** A record with its file uploaded and marked, the way a device does it. */
async function uploadedAttachment(visit: string, fields: Record<string, unknown> = {}): Promise<string> {
  const id = randomUUID();
  const [created] = await pushAttachments(aron, [upsert(id, null, { visit_id: visit, kind: "before", ...fields })]);
  expect(created.status).toBe("applied");
  expect((await uploadAs(aron, clinicId, id)).error).toBeNull();
  const [marked] = await pushAttachments(aron, [upsert(id, 1, { uploaded: true })]);
  expect(marked.status).toBe("applied");
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
    p_name: `Csatolmany Teszt ${runId}`,
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
});

afterAll(async () => {
  if (uploadedPaths.length > 0) await admin.storage.from("attachments").remove(uploadedPaths);
  if (organizationIds.length > 0) {
    await admin.from("organizations").delete().in("id", organizationIds);
  }
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe("the attachment record", () => {
  const id = randomUUID();

  test("is created before its file, for a tooth, with the values cleaned", async () => {
    const [result] = await pushAttachments(aron, [
      upsert(id, null, { visit_id: dogVisit, kind: "xray", tooth: 104, original_name: "  rtg-104.png ", uploaded: false }),
    ]);
    expect(result).toMatchObject({ id, status: "applied", rev: 1 });
    expect(await attachmentRow(id)).toMatchObject({
      visit_id: dogVisit,
      kind: "xray",
      tooth: 104,
      quadrant: null,
      original_name: "rtg-104.png",
      uploaded: false,
      mime_type: null,
      size_bytes: null,
    });
  });

  test("members read it, outsiders do not", async () => {
    expect((await vera.client.from("attachments").select("id").eq("id", id)).data).toHaveLength(1);
    expect((await emil.client.from("attachments").select("id").eq("id", id)).data).toEqual([]);
  });

  test("a tooth and a quadrant together, an unknown kind, a tooth the species lacks, or an unknown visit are refused", async () => {
    const create = (fields: Record<string, unknown>) =>
      pushAttachments(aron, [upsert(randomUUID(), null, { visit_id: dogVisit, kind: "other", ...fields })]).then(([r]) => r.status);
    expect(await create({ tooth: 104, quadrant: 1 })).toBe("invalid");
    expect(await create({ kind: "selfie" })).toBe("invalid");
    expect(await create({ tooth: 512 })).toBe("invalid");
    expect(await create({ quadrant: 5 })).toBe("invalid");
    expect(await create({ visit_id: randomUUID() })).toBe("invalid");
    expect(await create({ quadrant: 2 })).toBe("applied");

    const [onCat] = await pushAttachments(aron, [upsert(randomUUID(), null, { visit_id: catVisit, kind: "other", tooth: 105 })]);
    expect(onCat.status).toBe("invalid");
  });

  test("the visit cannot change afterwards", async () => {
    const [result] = await pushAttachments(aron, [upsert(id, 1, { visit_id: catVisit })]);
    expect(result.status).toBe("invalid");
  });

  test("a record cannot be marked uploaded before its file is there", async () => {
    const [result] = await pushAttachments(aron, [upsert(id, 1, { uploaded: true })]);
    expect(result.status).toBe("invalid");
    expect((await attachmentRow(id)).uploaded).toBe(false);
  });
});

describe("the file", () => {
  test("is uploaded to the organization's folder, and the server then takes size and type from it", async () => {
    const id = randomUUID();
    await pushAttachments(aron, [upsert(id, null, { visit_id: dogVisit, kind: "before", tooth: 108 })]);
    expect((await uploadAs(aron, clinicId, id)).error).toBeNull();

    const [marked] = await pushAttachments(aron, [upsert(id, 1, { uploaded: true })]);
    expect(marked.status).toBe("applied");
    expect(await attachmentRow(id)).toMatchObject({ uploaded: true, mime_type: "image/png", size_bytes: PNG.length });
  });

  test("a device cannot claim a size or a type of its own: the claim is ignored", async () => {
    const id = randomUUID();
    const [result] = await pushAttachments(aron, [upsert(id, null, { visit_id: dogVisit, kind: "after", mime_type: "application/pdf", size_bytes: 1 })]);
    expect(result.status).toBe("applied");
    expect(await attachmentRow(id)).toMatchObject({ mime_type: null, size_bytes: null });
  });

  test("uploaded never goes back to false", async () => {
    const id = await uploadedAttachment(dogVisit);
    const [result] = await pushAttachments(aron, [upsert(id, 2, { uploaded: false })]);
    expect(result.status).toBe("invalid");
    expect((await attachmentRow(id)).uploaded).toBe(true);
  });

  test("another organization's folder, a path that is not organization/uuid, and a file type that is not allowed are refused", async () => {
    expect((await uploadAs(emil, clinicId, randomUUID())).error).not.toBeNull();
    expect((await aron.client.storage.from("attachments").upload("not-a-valid-path", new Blob([PNG], { type: "image/png" }))).error).not.toBeNull();
    expect((await aron.client.storage.from("attachments").upload(`${clinicId}/nope`, new Blob([PNG], { type: "image/png" }))).error).not.toBeNull();
    expect((await uploadAs(aron, clinicId, randomUUID(), new TextEncoder().encode("hello"), "text/plain")).error).not.toBeNull();
    expect((await uploadAs(aron, clinicId, randomUUID(), new TextEncoder().encode("#!/bin/sh"), "application/x-sh")).error).not.toBeNull();
  });

  test("a PDF is allowed", async () => {
    expect((await uploadAs(aron, clinicId, randomUUID(), new TextEncoder().encode("%PDF-1.4\n%%EOF"), "application/pdf")).error).toBeNull();
  });

  test("members read it with a signed link, outsiders cannot", async () => {
    const id = await uploadedAttachment(dogVisit);
    const path = `${clinicId}/${id}`;

    const signed = await vera.client.storage.from("attachments").createSignedUrl(path, 60);
    expect(signed.error).toBeNull();
    const response = await fetch(signed.data!.signedUrl);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);

    expect((await emil.client.storage.from("attachments").createSignedUrl(path, 60)).data).toBeNull();
    expect((await emil.client.storage.from("attachments").download(path)).error).not.toBeNull();
  });

  test("nobody can delete it from a device", async () => {
    const id = await uploadedAttachment(dogVisit);
    const path = `${clinicId}/${id}`;
    await aron.client.storage.from("attachments").remove([path]);
    await olga.client.storage.from("attachments").remove([path]);
    expect((await vera.client.storage.from("attachments").download(path)).error).toBeNull();
  });
});

describe("a final visit", () => {
  test("its attachments are locked: a late edit and a new attachment are kept aside, not applied", async () => {
    const visit = await newVisit(aron, clinicId, await patientOf(dogVisit), { veterinarian_name: "Dr. Vera", asa_status: 2 });
    const id = await uploadedAttachment(visit, { tooth: 104 });
    expect((await vera.client.rpc("finalize_visit", { p_organization_id: clinicId, p_visit_id: visit })).error).toBeNull();

    const lateNew = randomUUID();
    const results = await pushAttachments(aron, [
      upsert(id, 2, { kind: "xray" }),
      upsert(lateNew, null, { visit_id: visit, kind: "after" }),
      { id, op: "delete", base_rev: 2, fields: {} },
    ]);
    expect(results.map((result) => result.status)).toEqual(["locked", "locked", "forbidden"]);

    expect(await attachmentRow(id)).toMatchObject({ kind: "before", deleted_at: null });
    expect((await admin.from("attachments").select("id").eq("id", lateNew)).data).toEqual([]);
    const { data } = await admin.from("sync_conflicts").select("field, overwritten_value, applied_value").eq("record_id", id);
    expect(data).toEqual([{ field: "kind", overwritten_value: "xray", applied_value: "before" }]);
  });
});

describe("deleting and who may write", () => {
  test("a deleted attachment is a tombstone, and a deleted one cannot be edited", async () => {
    const id = await uploadedAttachment(dogVisit);
    const [removed] = await pushAttachments(aron, [{ id, op: "delete", base_rev: 2, fields: {} }]);
    expect(removed.status).toBe("applied");
    expect((await attachmentRow(id)).deleted_at).not.toBeNull();
    const [edit] = await pushAttachments(aron, [upsert(id, 3, { kind: "xray" })]);
    expect(edit.status).toBe("deleted");
  });

  test("an outsider cannot write into someone else's organization", async () => {
    const { error } = await emil.client.rpc("sync_push_attachments", {
      p_organization_id: clinicId,
      p_changes: [upsert(randomUUID(), null, { visit_id: dogVisit, kind: "other" })] as never,
    });
    expect(error?.message).toBe("forbidden");
  });
});

describe("the storage allowance", () => {
  test("is reported to members, and used by the uploaded files only", async () => {
    const usage = await aron.client.rpc("my_storage_usage", { p_organization_id: clinicId });
    expect(usage.error).toBeNull();
    const used = Number(usage.data![0].used_bytes);
    expect(used).toBeGreaterThan(0);
    expect(Number(usage.data![0].limit_bytes)).toBeGreaterThan(used);
    expect((await emil.client.rpc("my_storage_usage", { p_organization_id: clinicId })).data).toEqual([]);
  });

  test("an upload is refused once the allowance is used up", async () => {
    const limit = Number((await aron.client.rpc("my_storage_usage", { p_organization_id: clinicId })).data![0].limit_bytes);
    // A (fictitious) stored file that fills the allowance.
    const { error } = await admin.from("attachments").insert({
      id: randomUUID(),
      organization_id: clinicId,
      visit_id: dogVisit,
      kind: "other",
      uploaded: true,
      size_bytes: limit,
    });
    expect(error).toBeNull();

    expect((await uploadAs(aron, clinicId, randomUUID())).error).not.toBeNull();
  });
});

async function patientOf(visitId: string): Promise<string> {
  const { data, error } = await admin.from("visits").select("patient_id").eq("id", visitId).single();
  if (error) throw error;
  return data.patient_id;
}
