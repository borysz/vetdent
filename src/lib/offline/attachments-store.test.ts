import "fake-indexeddb/auto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Database } from "@/lib/supabase/database.types";
import { attachmentOps, type ServerAttachment } from "./attachments-model";
import {
  addAttachment,
  countPendingFiles,
  listAttachmentsOfVisit,
  releaseConfirmedFiles,
  removeAttachment,
  retryRefusedFiles,
  updateAttachment,
} from "./attachments-store";
import { LocalDatabase } from "./local-db";
import { uploadPendingFiles } from "./upload-queue";
import { EMPTY_VISIT_FIELDS, visitOps, type ServerVisit } from "./visits-model";

const ORG = "11111111-1111-4111-8111-111111111111";
const VISIT = "visit-1";

let db: LocalDatabase;
let counter = 0;

beforeEach(() => {
  counter += 1;
  db = new LocalDatabase(`attachments-test-${counter}`);
});

afterEach(async () => {
  db.close();
  await db.delete();
});

const photo = (name = "foto.png", type = "image/png", bytes = 8) => new File([new Uint8Array(bytes)], name, { type });

async function putVisit(id: string, status: "draft" | "final") {
  const fields = { ...EMPTY_VISIT_FIELDS, patientId: "patient-1", visitDate: "2026-11-16" };
  const row = visitOps.newLocal(id, ORG, fields, 1);
  const server: ServerVisit = { ...fields, id, rev: 1, seq: 1, deletedAt: null, updatedAt: "", status, finalizedAt: null };
  await db.visits.put({ ...row, server, pending: {}, pendingBaseRev: null });
}

describe("adding an attachment on the device", () => {
  test("stores the file and the record at once, and lists it with the visit", async () => {
    await putVisit(VISIT, "draft");
    const result = await addAttachment(db, ORG, { visitId: VISIT, tooth: 104, kind: "before", file: photo("rtg.png") });
    expect(result.ok).toBe(true);

    const [item] = await listAttachmentsOfVisit(db, VISIT);
    expect(item).toMatchObject({ visitId: VISIT, tooth: 104, quadrant: null, kind: "before", originalName: "rtg.png", uploaded: false, isNew: true, type: "image/png" });
    expect(item.localBlob).not.toBeNull();
    expect(await countPendingFiles(db)).toBe(1);
  });

  test("a tooth and a quadrant exclude each other; neither means the whole visit", async () => {
    await putVisit(VISIT, "draft");
    await addAttachment(db, ORG, { visitId: VISIT, tooth: 104, quadrant: 2, kind: "xray", file: photo() });
    await addAttachment(db, ORG, { visitId: VISIT, quadrant: 3, kind: "xray", file: photo() });
    await addAttachment(db, ORG, { visitId: VISIT, kind: "other", file: photo() });

    const items = await listAttachmentsOfVisit(db, VISIT);
    expect(items.map((item) => [item.tooth, item.quadrant])).toEqual([[104, null], [null, 3], [null, null]]);
  });

  test("a type that is not allowed, an empty file and a file that is too big are refused, and nothing is stored", async () => {
    await putVisit(VISIT, "draft");
    expect(await addAttachment(db, ORG, { visitId: VISIT, kind: "other", file: photo("a.gif", "image/gif") })).toEqual({ ok: false, error: "type" });
    expect(await addAttachment(db, ORG, { visitId: VISIT, kind: "other", file: new File([], "x.png", { type: "image/png" }) })).toEqual({ ok: false, error: "empty" });
    const big = { type: "image/png", size: 16 * 1024 * 1024, name: "big.png" } as File;
    expect(await addAttachment(db, ORG, { visitId: VISIT, kind: "other", file: big })).toEqual({ ok: false, error: "size" });
    expect(await db.attachments.count()).toBe(0);
    expect(await db.files.count()).toBe(0);
  });

  test("a final visit takes no new attachment", async () => {
    await putVisit(VISIT, "final");
    expect(await addAttachment(db, ORG, { visitId: VISIT, kind: "other", file: photo() })).toEqual({ ok: false, error: "finalVisit" });
  });

  test("the kind and the target can be corrected", async () => {
    await putVisit(VISIT, "draft");
    const added = await addAttachment(db, ORG, { visitId: VISIT, quadrant: 2, kind: "other", file: photo() });
    if (!added.ok) throw new Error("not added");
    await updateAttachment(db, added.id, { kind: "after", tooth: 204 });
    expect((await listAttachmentsOfVisit(db, VISIT))[0]).toMatchObject({ kind: "after", tooth: 204, quadrant: null });
  });

  test("an attachment that never reached the server disappears together with its file", async () => {
    await putVisit(VISIT, "draft");
    const added = await addAttachment(db, ORG, { visitId: VISIT, kind: "other", file: photo() });
    if (!added.ok) throw new Error("not added");
    await removeAttachment(db, added.id);
    expect(await listAttachmentsOfVisit(db, VISIT)).toEqual([]);
    expect(await db.files.count()).toBe(0);
  });
});

/** A storage client that records uploads and fails the way the test asks. */
function fakeSupabase(behaviour: { failWith?: { message: string; statusCode?: string }; usage?: { used: number; limit: number } }) {
  const uploaded: string[] = [];
  const client = {
    storage: {
      from: () => ({
        upload: async (path: string) => {
          if (behaviour.failWith) return { error: behaviour.failWith };
          uploaded.push(path);
          return { error: null };
        },
      }),
    },
    rpc: async () => ({
      data: [{ used_bytes: behaviour.usage?.used ?? 0, limit_bytes: behaviour.usage?.limit ?? 1000 }],
    }),
  } as unknown as SupabaseClient<Database>;
  return { client, uploaded };
}

describe("the upload queue", () => {
  async function queueTwo() {
    await putVisit(VISIT, "draft");
    const a = await addAttachment(db, ORG, { visitId: VISIT, kind: "before", file: photo("a.png") });
    const b = await addAttachment(db, ORG, { visitId: VISIT, kind: "after", file: photo("b.png") });
    if (!a.ok || !b.ok) throw new Error("not added");
    return [a.id, b.id];
  }

  test("uploads the files to the organization's folder, oldest first, and marks the records", async () => {
    const ids = await queueTwo();
    const { client, uploaded } = fakeSupabase({});

    expect(await uploadPendingFiles(db, client, ORG)).toEqual({ uploaded: 2, refused: 0, offline: false });
    expect(uploaded).toEqual(ids.map((id) => `${ORG}/${id}`));
    expect(await countPendingFiles(db)).toBe(0);
    expect((await listAttachmentsOfVisit(db, VISIT)).every((item) => item.hasPendingChanges && item.uploaded)).toBe(true);
  });

  test("without a connection nothing is lost: the files stay queued for the next round", async () => {
    await queueTwo();
    const offline = fakeSupabase({ failWith: { message: "Failed to fetch" } });
    expect(await uploadPendingFiles(db, offline.client, ORG)).toEqual({ uploaded: 0, refused: 0, offline: true });
    expect(await countPendingFiles(db)).toBe(2);

    const online = fakeSupabase({});
    expect((await uploadPendingFiles(db, online.client, ORG)).uploaded).toBe(2);
  });

  test("a refused upload is marked with the reason and waits until it is retried", async () => {
    await queueTwo();
    const full = fakeSupabase({ failWith: { message: "new row violates row-level security policy", statusCode: "403" }, usage: { used: 1000, limit: 1000 } });
    expect(await uploadPendingFiles(db, full.client, ORG)).toEqual({ uploaded: 0, refused: 2, offline: false });
    expect((await listAttachmentsOfVisit(db, VISIT)).map((item) => item.uploadProblem)).toEqual(["quota", "quota"]);
    expect(await countPendingFiles(db)).toBe(0);

    await retryRefusedFiles(db);
    expect(await countPendingFiles(db)).toBe(2);
  });

  test("a refusal that is not about the allowance is reported as denied", async () => {
    await queueTwo();
    const denied = fakeSupabase({ failWith: { message: "permission denied", statusCode: "403" }, usage: { used: 10, limit: 1000 } });
    await uploadPendingFiles(db, denied.client, ORG);
    expect((await listAttachmentsOfVisit(db, VISIT))[0].uploadProblem).toBe("denied");
  });

  test("once the server confirms the record the full file is released, and the thumbnail stays", async () => {
    const [id] = await queueTwo();
    await uploadPendingFiles(db, fakeSupabase({}).client, ORG);

    // Nothing is released while the record's "uploaded" is only a pending edit.
    expect(await releaseConfirmedFiles(db)).toBe(0);

    // The server now has the record as uploaded.
    const row = (await db.attachments.get(id))!;
    const server: ServerAttachment = {
      ...attachmentOps.spec.empty,
      visitId: VISIT,
      kind: "before",
      uploaded: true,
      id,
      rev: 2,
      seq: 5,
      deletedAt: null,
      updatedAt: "",
      mimeType: "image/png",
      sizeBytes: 8,
    };
    await db.attachments.put({ ...row, server, pending: {}, pendingBaseRev: null });

    expect(await releaseConfirmedFiles(db)).toBe(1);
    const item = (await listAttachmentsOfVisit(db, VISIT)).find((candidate) => candidate.id === id)!;
    expect(item.localBlob).toBeNull();
    expect(item.mimeType).toBe("image/png");
  });
});
