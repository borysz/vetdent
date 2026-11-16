import Dexie, { type Table } from "dexie";
import type { LocalClientRow } from "./clients-model";

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
  meta!: Table<MetaEntry, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      clients: "id, organizationId, touchedAt",
      meta: "key",
    });
  }
}

export function databaseName(userId: string, organizationId: string): string {
  return `vetdent:${userId}:${organizationId}`;
}

export const META_KEYS = {
  clientsCursor: "clients.cursor",
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
