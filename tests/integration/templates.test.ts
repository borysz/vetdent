import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Templates, verified against the real database: who sees and changes which
 * template, the shape of the two kinds, and the payload rules.
 *
 *   olga  – owner of the clinic (edits the catalogue)
 *   vera  – vet (edits the catalogue)
 *   aron  – assistant (own templates only)
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

async function pushTemplates(user: TestUser, changes: object[], organizationId: string = clinicId) {
  const { data, error } = await user.client.rpc("sync_push_templates", {
    p_organization_id: organizationId,
    p_changes: changes as never,
  });
  if (error) throw new Error(error.message);
  return data as unknown as PushResult[];
}

async function templateRow(id: string) {
  const { data, error } = await admin.from("templates").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

async function visibleTo(user: TestUser, id: string): Promise<boolean> {
  const { data } = await user.client.from("templates").select("id").eq("id", id);
  return (data ?? []).length === 1;
}

const textTemplate = (fields: Record<string, unknown> = {}) => ({
  kind: "text",
  name: "Utókezelés: puha táp",
  text_target: "feeding_advice",
  body: "Három napig áztatott vagy pépes táp.",
  ...fields,
});

const treatmentTemplate = (payload: object, fields: Record<string, unknown> = {}) => ({
  kind: "treatment",
  name: "Rutin fogtisztítás",
  payload: JSON.stringify(payload),
  ...fields,
});

let olga: TestUser;
let vera: TestUser;
let aron: TestUser;
let emil: TestUser;
let clinicId: string;
let emilOrgId: string;

beforeAll(async () => {
  [olga, vera, aron, emil] = await Promise.all([
    createTestUser("olga"),
    createTestUser("vera"),
    createTestUser("aron"),
    createTestUser("emil"),
  ]);

  const clinic = await olga.client.rpc("create_organization", {
    p_type: "clinic",
    p_name: `Sablon Teszt ${runId}`,
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
});

afterAll(async () => {
  if (organizationIds.length > 0) {
    await admin.from("organizations").delete().in("id", organizationIds);
  }
  for (const id of userIds) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe("a personal template", () => {
  const id = randomUUID();

  test("is stored with its fields cleaned", async () => {
    const [result] = await pushTemplates(aron, [upsert(id, null, textTemplate({ name: "  Utókezelés: puha táp " }))]);
    expect(result).toMatchObject({ id, status: "applied", rev: 1 });
    expect(await templateRow(id)).toMatchObject({
      kind: "text",
      name: "Utókezelés: puha táp",
      shared: false,
      text_target: "feeding_advice",
      body: "Három napig áztatott vagy pépes táp.",
      payload: null,
      created_by: aron.id,
    });
  });

  test("is seen by its owner only", async () => {
    expect(await visibleTo(aron, id)).toBe(true);
    for (const other of [vera, olga, emil]) expect(await visibleTo(other, id)).toBe(false);
  });

  test("is changed by its owner only, not even by the owner of the clinic", async () => {
    const [byOwner] = await pushTemplates(aron, [upsert(id, 1, { body: "Új szöveg." })]);
    expect(byOwner.status).toBe("applied");

    const [byBoss] = await pushTemplates(olga, [upsert(id, 2, { body: "Átírva." })]);
    expect(byBoss.status).toBe("forbidden");
    expect((await templateRow(id)).body).toBe("Új szöveg.");
  });

  test("an assistant cannot make it shared, and cannot create a shared one", async () => {
    const [change] = await pushTemplates(aron, [upsert(id, 2, { shared: true })]);
    expect(change.status).toBe("forbidden");
    const [create] = await pushTemplates(aron, [upsert(randomUUID(), null, textTemplate({ shared: true }))]);
    expect(create.status).toBe("forbidden");
    expect((await templateRow(id)).shared).toBe(false);
  });
});

describe("a shared template", () => {
  const id = randomUUID();

  test("is created by someone who edits the catalogue and seen by every member", async () => {
    const [result] = await pushTemplates(vera, [upsert(id, null, textTemplate({ shared: true, name: "Közös utókezelés" }))]);
    expect(result.status).toBe("applied");
    for (const member of [vera, olga, aron]) expect(await visibleTo(member, id)).toBe(true);
    expect(await visibleTo(emil, id)).toBe(false);
  });

  test("is changed by those who edit the catalogue, not by an assistant", async () => {
    const [byAssistant] = await pushTemplates(aron, [upsert(id, 1, { body: "Átírva." })]);
    expect(byAssistant.status).toBe("forbidden");
    const [byBoss] = await pushTemplates(olga, [upsert(id, 1, { body: "A tulajdonos javította." })]);
    expect(byBoss.status).toBe("applied");
    expect((await templateRow(id)).body).toBe("A tulajdonos javította.");
  });

  test("can be made personal again by the catalogue editors only", async () => {
    const [byAssistant] = await pushTemplates(aron, [upsert(id, 2, { shared: false })]);
    expect(byAssistant.status).toBe("forbidden");
    const [byVet] = await pushTemplates(vera, [upsert(id, 2, { shared: false })]);
    expect(byVet.status).toBe("applied");
    expect(await visibleTo(olga, id)).toBe(false);
  });

  test("two editors changing different fields keep both; the same field keeps the later write and records the other", async () => {
    const shared = randomUUID();
    await pushTemplates(vera, [upsert(shared, null, textTemplate({ shared: true }))]);
    await pushTemplates(vera, [upsert(shared, 1, { name: "Átnevezve", text_target: "sutures" })]);
    const [result] = await pushTemplates(olga, [upsert(shared, 1, { name: "Másik név", body: "Más szöveg." })]);
    expect(result).toMatchObject({ status: "applied", conflicts: 1 });
    expect(await templateRow(shared)).toMatchObject({ name: "Másik név", body: "Más szöveg.", text_target: "sutures" });
  });
});

describe("the two kinds", () => {
  const create = (fields: Record<string, unknown>) =>
    pushTemplates(aron, [upsert(randomUUID(), null, fields)]).then(([result]) => result.status);

  test("a text template needs a body and no payload; a treatment template the opposite", async () => {
    expect(await create({ kind: "text", name: "Üres" })).toBe("invalid");
    expect(await create(textTemplate({ payload: JSON.stringify({ texts: {} }) }))).toBe("invalid");
    expect(await create({ kind: "treatment", name: "Üres" })).toBe("invalid");
    expect(await create(treatmentTemplate({ texts: {} }, { body: "nem lehet" }))).toBe("invalid");
    expect(await create(treatmentTemplate({ texts: { feeding_advice: "Puha táp." } }))).toBe("applied");
  });

  test("the kind cannot change afterwards", async () => {
    const id = randomUUID();
    await pushTemplates(aron, [upsert(id, null, textTemplate())]);
    const [result] = await pushTemplates(aron, [upsert(id, 1, { kind: "treatment" })]);
    expect(result.status).toBe("invalid");
  });

  test("a name is required; the text target must be a field of the visit", async () => {
    expect(await create(textTemplate({ name: "   " }))).toBe("invalid");
    expect(await create(textTemplate({ text_target: "nonsense" }))).toBe("invalid");
    expect(await create(textTemplate({ text_target: null }))).toBe("applied");
  });
});

describe("the payload of a treatment template", () => {
  const create = (payload: object) =>
    pushTemplates(aron, [upsert(randomUUID(), null, treatmentTemplate(payload))]).then(([result]) => result.status);

  test("teeth with findings and procedures, texts and medications are accepted", async () => {
    expect(
      await create({
        teeth: [
          { tooth: null, findings: [{ code: "T", level: "2" }], procedures: [{ code: "U", level: "", state: "done" }, { code: "POL", level: "", state: "done" }] },
          { tooth: 104, findings: [], procedures: [{ code: "EXT", level: "S", state: "planned" }] },
        ],
        texts: { feeding_advice: "Puha táp.", sutures: "6-0 Monocryl" },
        medications: [{ name: "Meloxicam", dose: "0,1 mg/kg", frequency: "naponta", duration: "5 nap" }],
      }),
    ).toBe("applied");
  });

  test("impossible content is refused", async () => {
    expect(await create({ teeth: [{ tooth: 512, findings: [], procedures: [] }] })).toBe("invalid");
    expect(await create({ teeth: [{ tooth: 104, findings: [{ code: "XYZ", level: "" }], procedures: [] }] })).toBe("invalid");
    expect(await create({ teeth: [{ tooth: 104, findings: [{ code: "M", level: "missing" }], procedures: [{ code: "U", level: "", state: "done" }] }] })).toBe("invalid");
    expect(await create({ texts: { surprise: "x" } })).toBe("invalid");
    expect(await create({ texts: { feeding_advice: "x".repeat(2001) } })).toBe("invalid");
    expect(await create({ medications: [{ name: "" }] })).toBe("invalid");
    expect(await create({ other: [] })).toBe("invalid");
    expect(await create({ teeth: Array.from({ length: 43 }, () => ({ tooth: null, findings: [], procedures: [] })) })).toBe("invalid");
  });
});

describe("deleting and who may write", () => {
  test("a deleted template is a tombstone that other members still see", async () => {
    const id = randomUUID();
    await pushTemplates(vera, [upsert(id, null, textTemplate({ shared: true }))]);
    const [result] = await pushTemplates(olga, [{ id, op: "delete", base_rev: 1, fields: {} }]);
    expect(result.status).toBe("applied");
    const { data } = await aron.client.from("templates").select("deleted_at").eq("id", id).single();
    expect(data?.deleted_at).not.toBeNull();
  });

  test("an outsider cannot write into someone else's organization", async () => {
    const { error } = await emil.client.rpc("sync_push_templates", {
      p_organization_id: clinicId,
      p_changes: [upsert(randomUUID(), null, textTemplate())] as never,
    });
    expect(error?.message).toBe("forbidden");
  });
});
