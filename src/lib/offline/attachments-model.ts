/**
 * Attachments (photos, X-rays, PDFs) on the device: the generic record rules
 * (see `record-model.ts`) bound to the metadata of an attachment. The file
 * itself is kept apart (see `attachments-store.ts`): it is uploaded to the
 * storage bucket first, and only then is the record marked `uploaded`.
 */

import { recordOps, type LocalRow, type RecordSpec, type RecordView, type ServerRecord } from "./record-model";

export const ATTACHMENT_KINDS = ["xray", "before", "after", "other"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const ATTACHMENT_FIELDS = ["visitId", "tooth", "quadrant", "kind", "originalName", "uploaded"] as const;
export type AttachmentField = (typeof ATTACHMENT_FIELDS)[number];

export interface AttachmentFields {
  visitId: string;
  /** Triadan number; `null` with a `null` quadrant means the visit as a whole. */
  tooth: number | null;
  /** 1–4; never together with a tooth. */
  quadrant: number | null;
  kind: AttachmentKind;
  originalName: string | null;
  /** The file is in the storage bucket. Never goes back to false. */
  uploaded: boolean;
}

export const ATTACHMENT_WIRE_FIELD: Readonly<Record<AttachmentField, string>> = {
  visitId: "visit_id",
  tooth: "tooth",
  quadrant: "quadrant",
  kind: "kind",
  originalName: "original_name",
  uploaded: "uploaded",
};

export const EMPTY_ATTACHMENT_FIELDS: AttachmentFields = {
  visitId: "",
  tooth: null,
  quadrant: null,
  kind: "other",
  originalName: null,
  uploaded: false,
};

export const attachmentSpec: RecordSpec<AttachmentFields> = {
  fields: ATTACHMENT_FIELDS,
  wire: ATTACHMENT_WIRE_FIELD,
  empty: EMPTY_ATTACHMENT_FIELDS,
};

/** The server also tells the type and size of the stored file (read from the file, not from the device). */
export type ServerAttachment = ServerRecord<AttachmentFields> & { mimeType: string | null; sizeBytes: number | null };
export type LocalAttachmentRow = LocalRow<AttachmentFields>;
export type AttachmentView = RecordView<AttachmentFields> & { mimeType: string | null; sizeBytes: number | null };

const baseOps = recordOps(attachmentSpec);

export const attachmentOps = {
  ...baseOps,
  viewOf(row: LocalRow<AttachmentFields>): AttachmentView {
    const server = row.server as ServerAttachment | null;
    return { ...baseOps.viewOf(row), mimeType: server?.mimeType ?? null, sizeBytes: server?.sizeBytes ?? null };
  },
};

/** Where the file of an attachment is in the bucket: one folder per organization. */
export function storagePath(organizationId: string, attachmentId: string): string {
  return `${organizationId}/${attachmentId}`;
}
