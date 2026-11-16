import Dexie, { type Table } from "dexie";
import type { LocalAttachmentRow } from "./attachments-model";
import type { LocalFileRow } from "./attachments-store";
import type { LocalClientRow } from "./clients-model";
import type { LocalPatientRow } from "./patients-model";
import type { LocalTemplateRow } from "./templates-model";
import type { LocalToothRow } from "./teeth-model";
import type { LocalVisitRow } from "./visits-model";

export interface MetaEntry {
  key: string;
  value: string | number | null;
}

/**
 * The device's own database (IndexedDB). One per signed-in user and
 * organization, so two accounts on a shared tablet never see each other's data.
 */
export class LocalDatabase extends Dexie {
  clients!: Table<LocalClientRow, string>;
  patients!: Table<LocalPatientRow, string>;
  visits!: Table<LocalVisitRow, string>;
  teeth!: Table<LocalToothRow, string>;
  templates!: Table<LocalTemplateRow, string>;
  attachments!: Table<LocalAttachmentRow, string>;
  /** The files of attachments made on this device (not synchronised as records; uploaded by the upload queue). */
  files!: Table<LocalFileRow, string>;
  meta!: Table<MetaEntry, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      clients: "id, organizationId, touchedAt",
      meta: "key",
    });
    this.version(2).stores({
      clients: "id, organizationId, touchedAt",
      patients: "id, organizationId, touchedAt",
      meta: "key",
    });
    this.version(3).stores({
      clients: "id, organizationId, touchedAt",
      patients: "id, organizationId, touchedAt",
      visits: "id, organizationId, touchedAt",
      meta: "key",
    });
    // `visitId` of a tooth record is stored beside the record (see `decorate` in the sync engine) so a
    // visit's teeth can be read without scanning every tooth of the organization.
    this.version(4).stores({
      clients: "id, organizationId, touchedAt",
      patients: "id, organizationId, touchedAt",
      visits: "id, organizationId, touchedAt",
      teeth: "id, organizationId, visitId, touchedAt",
      meta: "key",
    });
    this.version(5).stores({
      clients: "id, organizationId, touchedAt",
      patients: "id, organizationId, touchedAt",
      visits: "id, organizationId, touchedAt",
      teeth: "id, organizationId, visitId, touchedAt",
      templates: "id, organizationId, touchedAt",
      meta: "key",
    });
    this.version(6).stores({
      clients: "id, organizationId, touchedAt",
      patients: "id, organizationId, touchedAt",
      visits: "id, organizationId, touchedAt",
      teeth: "id, organizationId, visitId, touchedAt",
      templates: "id, organizationId, touchedAt",
      attachments: "id, organizationId, touchedAt",
      files: "id, organizationId, visitId",
      meta: "key",
    });
  }
}

export function databaseName(userId: string, organizationId: string): string {
  return `vetdent:${userId}:${organizationId}`;
}

export const META_KEYS = {
  clientsCursor: "clients.cursor",
  patientsCursor: "patients.cursor",
  visitsCursor: "visits.cursor",
  teethCursor: "teeth.cursor",
  templatesCursor: "templates.cursor",
  attachmentsCursor: "attachments.cursor",
  lastSyncAt: "lastSyncAt",
} as const;

export async function readMeta(db: LocalDatabase, key: string): Promise<MetaEntry["value"] | undefined> {
  return (await db.meta.get(key))?.value;
}

export async function writeMeta(db: LocalDatabase, key: string, value: MetaEntry["value"]): Promise<void> {
  await db.meta.put({ key, value });
}

/** Removes every trace of the signed-in user's data from this device. */
export async function wipeDatabase(name: string): Promise<void> {
  await Dexie.delete(name);
}
