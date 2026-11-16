import {
  deleteLocalClient,
  editLocalClient,
  isDeleted,
  newLocalClient,
  viewOf,
  type ClientFields,
  type ClientView,
} from "./clients-model";
import type { LocalDatabase } from "./local-db";

/**
 * Reading and writing clients on the device. Every write is local and
 * immediate; the sync engine sends it when it can.
 */

/** Lower case and without accents, so "Kovacs", "kovács" and "KOVÁCS" find each other. */
export function normalizeForSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function matchesSearch(client: ClientView, query: string): boolean {
  const needle = normalizeForSearch(query.trim());
  if (needle.length === 0) return true;
  // Phone numbers are matched by digits only, so "+36 30 111" finds "0630111…" typed any way.
  const digits = needle.replace(/\D/g, "");
  const haystack = normalizeForSearch([client.fullName, client.email ?? "", client.address ?? ""].join(" "));
  if (haystack.includes(needle)) return true;
  return digits.length >= 3 && (client.phone ?? "").replace(/\D/g, "").includes(digits);
}

/** The clients of an organization that are not deleted, by name. */
export async function listClients(db: LocalDatabase, organizationId: string, query = ""): Promise<ClientView[]> {
  const rows = await db.clients.where("organizationId").equals(organizationId).toArray();
  return rows
    .filter((row) => !isDeleted(row))
    .map(viewOf)
    .filter((client) => matchesSearch(client, query))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "hu"));
}

export async function getClient(db: LocalDatabase, id: string): Promise<ClientView | null> {
  const row = await db.clients.get(id);
  return row && !isDeleted(row) ? viewOf(row) : null;
}

/** Creates the record with its final id; it exists on this device from this moment on. */
export async function createClient(
  db: LocalDatabase,
  organizationId: string,
  fields: ClientFields,
  id: string = crypto.randomUUID(),
): Promise<string> {
  await db.clients.put(newLocalClient(id, organizationId, fields, Date.now()));
  return id;
}

export async function updateClient(db: LocalDatabase, id: string, fields: Partial<ClientFields>): Promise<void> {
  await db.transaction("rw", db.clients, async () => {
    const row = await db.clients.get(id);
    if (row) await db.clients.put(editLocalClient(row, fields, Date.now()));
  });
}

export async function removeClient(db: LocalDatabase, id: string): Promise<void> {
  await db.transaction("rw", db.clients, async () => {
    const row = await db.clients.get(id);
    if (!row) return;
    const next = deleteLocalClient(row, Date.now());
    if (next === null) await db.clients.delete(id);
    else await db.clients.put(next);
  });
}
