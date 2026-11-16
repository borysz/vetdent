import { checkFile, prepareFile, type FileError } from "./attachment-file";
import {
  attachmentOps,
  type AttachmentKind,
  type AttachmentView,
  type ServerAttachment,
} from "./attachments-model";
import type { LocalDatabase } from "./local-db";
import { isDeleted } from "./record-model";
import { statusOf } from "./visits-model";

/**
 * Reading and writing attachments on the device. A new photo is stored here at
 * once (so it shows on the visit and survives closing the browser) and is
 * uploaded later by the upload queue; the record follows when the file is
 * safely in the bucket.
 */

/** What this device holds of an attachment's file. */
export interface LocalFileRow {
  /** The attachment's id. */
  id: string;
  organizationId: string;
  visitId: string;
  /** The file to upload; `null` once the server has confirmed it, to give the space back. */
  blob: Blob | null;
  /** A small picture; stays, so the list works offline. `null` for a PDF. */
  thumbnail: Blob | null;
  type: string;
  size: number;
  /** This device has put the file in the bucket. */
  uploaded: boolean;
  /** The upload was refused: `quota` (storage allowance used up) or `denied`. */
  problem: "quota" | "denied" | null;
  /** When the attachment was made on this device (ms); strictly increasing, so "oldest first" is well defined. */
  createdAt: number;
}

let lastCreatedAt = 0;
function nextCreatedAt(): number {
  lastCreatedAt = Math.max(Date.now(), lastCreatedAt + 1);
  return lastCreatedAt;
}

export interface AttachmentListItem extends AttachmentView {
  /** The small picture held on this device, if any. */
  thumbnail: Blob | null;
  /** The file is on this device and not yet confirmed by the server (so it can be shown without a connection). */
  localBlob: Blob | null;
  /** This device's own file type / size while the server has not told them yet. */
  type: string | null;
  /** The upload of this device's file was refused (the sync `problem` of the record is separate). */
  uploadProblem: LocalFileRow["problem"];
}

/** The attachments of a visit, oldest first. */
export async function listAttachmentsOfVisit(db: LocalDatabase, visitId: string): Promise<AttachmentListItem[]> {
  const rows = await db.attachments.toArray();
  const files = new Map((await db.files.where("visitId").equals(visitId).toArray()).map((file) => [file.id, file]));

  return rows
    .filter((row) => !isDeleted(row))
    .map((row) => ({ row, view: attachmentOps.viewOf(row) }))
    .filter(({ view }) => view.visitId === visitId)
    .map(({ row, view }) => ({ row, view, order: files.get(row.id)?.createdAt ?? (Date.parse((row.server?.updatedAt) ?? "") || row.touchedAt) }))
    .sort((a, b) => a.order - b.order || a.row.id.localeCompare(b.row.id))
    .map(({ row, view }) => {
      const file = files.get(row.id);
      return {
        ...view,
        thumbnail: file?.thumbnail ?? null,
        localBlob: file?.blob ?? null,
        type: view.mimeType ?? file?.type ?? null,
        uploadProblem: file?.problem ?? null,
      };
    });
}

export interface NewAttachment {
  visitId: string;
  /** At most one of `tooth` and `quadrant`. */
  tooth?: number | null;
  quadrant?: number | null;
  kind: AttachmentKind;
  file: File;
}

export type AddResult = { ok: true; id: string } | { ok: false; error: FileError | "finalVisit" };

/** Stores the file and its record on the device. A final visit takes no new attachment. */
export async function addAttachment(
  db: LocalDatabase,
  organizationId: string,
  input: NewAttachment,
  id: string = crypto.randomUUID(),
): Promise<AddResult> {
  const refused = checkFile(input.file);
  if (refused) return { ok: false, error: refused };

  const visit = await db.visits.get(input.visitId);
  if (visit && statusOf(visit) === "final") return { ok: false, error: "finalVisit" };

  const prepared = await prepareFile(input.file);
  const tooth = input.tooth ?? null;
  const quadrant = tooth === null ? (input.quadrant ?? null) : null;

  await db.transaction("rw", db.attachments, db.files, async () => {
    await db.files.put({
      id,
      organizationId,
      visitId: input.visitId,
      blob: prepared.blob,
      thumbnail: prepared.thumbnail,
      type: prepared.type,
      size: prepared.blob.size,
      uploaded: false,
      problem: null,
      createdAt: nextCreatedAt(),
    });
    await db.attachments.put(
      attachmentOps.newLocal(
        id,
        organizationId,
        { visitId: input.visitId, tooth, quadrant, kind: input.kind, originalName: input.file.name.slice(0, 200) || null, uploaded: false },
        Date.now(),
      ),
    );
  });
  return { ok: true, id };
}

/** The target and kind of an attachment can be corrected; the file cannot be replaced. */
export async function updateAttachment(
  db: LocalDatabase,
  id: string,
  fields: Partial<{ tooth: number | null; quadrant: number | null; kind: AttachmentKind }>,
): Promise<void> {
  await db.transaction("rw", db.attachments, db.visits, async () => {
    const row = await db.attachments.get(id);
    if (!row) return;
    const visit = await db.visits.get(attachmentOps.viewOf(row).visitId);
    if (visit && statusOf(visit) === "final") return;
    const next = { ...fields };
    // A tooth and a quadrant exclude each other.
    if (next.tooth != null) next.quadrant = null;
    await db.attachments.put(attachmentOps.editLocal(row, next, Date.now()));
  });
}

export async function removeAttachment(db: LocalDatabase, id: string): Promise<void> {
  await db.transaction("rw", db.attachments, db.files, db.visits, async () => {
    const row = await db.attachments.get(id);
    if (!row) return;
    const visit = await db.visits.get(attachmentOps.viewOf(row).visitId);
    if (visit && statusOf(visit) === "final") return;
    const next = attachmentOps.deleteLocal(row, Date.now());
    if (next === null) {
      await db.attachments.delete(id);
      await db.files.delete(id);
    } else {
      await db.attachments.put(next);
    }
  });
}

// ---------------------------------------------------------------------------
// The upload queue's view of the device
// ---------------------------------------------------------------------------

/** Files that are here and not yet in the bucket, oldest first; one that was refused waits until it is retried. */
export async function pendingUploads(db: LocalDatabase): Promise<LocalFileRow[]> {
  const files = await db.files.toArray();
  return files
    .filter((file) => file.blob !== null && !file.uploaded && file.problem === null)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function countPendingFiles(db: LocalDatabase): Promise<number> {
  return (await pendingUploads(db)).length;
}

/** The file is in the bucket: remember it, and mark the record so the server can confirm. */
export async function markFileUploaded(db: LocalDatabase, id: string): Promise<void> {
  await db.transaction("rw", db.files, db.attachments, async () => {
    const file = await db.files.get(id);
    if (file) await db.files.put({ ...file, uploaded: true, problem: null });
    const row = await db.attachments.get(id);
    if (row && !attachmentOps.viewOf(row).uploaded) {
      await db.attachments.put(attachmentOps.editLocal(row, { uploaded: true }, Date.now()));
    }
  });
}

export async function markFileProblem(db: LocalDatabase, id: string, problem: "quota" | "denied"): Promise<void> {
  const file = await db.files.get(id);
  if (file) await db.files.put({ ...file, problem });
}

/** Gives the user's retry a chance: a refused file goes back into the queue. */
export async function retryRefusedFiles(db: LocalDatabase): Promise<void> {
  const files = await db.files.toArray();
  await db.files.bulkPut(files.filter((file) => file.problem !== null).map((file) => ({ ...file, problem: null })));
}

/**
 * The full file is no longer needed on the device once the server confirms the
 * record is uploaded (the thumbnail stays). Frees the space a photo took.
 */
export async function releaseConfirmedFiles(db: LocalDatabase): Promise<number> {
  const files = await db.files.toArray();
  let released = 0;
  for (const file of files) {
    if (file.blob === null || !file.uploaded) continue;
    const row = await db.attachments.get(file.id);
    const server = row?.server as ServerAttachment | null | undefined;
    if (server?.uploaded && (row?.pending.uploaded === undefined)) {
      await db.files.put({ ...file, blob: null });
      released += 1;
    }
  }
  return released;
}
