import { isDeleted } from "./record-model";
import { clientOps } from "./clients-model";
import { normalizeForSearch } from "./clients-store";
import type { LocalDatabase } from "./local-db";
import { patientOps, type PatientFields, type PatientView } from "./patients-model";

/**
 * Reading and writing patients on the device. Every write is local and
 * immediate; the sync engine sends it when it can.
 */

export interface PatientListItem extends PatientView {
  /** Name of the owner as far as this device knows it; empty if unknown. */
  ownerName: string;
}

function matches(item: PatientListItem, query: string): boolean {
  const needle = normalizeForSearch(query.trim());
  if (needle.length === 0) return true;
  const haystack = normalizeForSearch([item.name, item.breed ?? "", item.microchip ?? "", item.ownerName].join(" "));
  return haystack.includes(needle);
}

/** The patients of an organization that are not deleted, by name, with their owner's name. */
export async function listPatients(
  db: LocalDatabase,
  organizationId: string,
  options: { query?: string; clientId?: string } = {},
): Promise<PatientListItem[]> {
  const [patientRows, clientRows] = await Promise.all([
    db.patients.where("organizationId").equals(organizationId).toArray(),
    db.clients.where("organizationId").equals(organizationId).toArray(),
  ]);

  const owners = new Map(clientRows.map((row) => [row.id, clientOps.viewOf(row).fullName]));

  return patientRows
    .filter((row) => !isDeleted(row))
    .map((row) => ({ ...patientOps.viewOf(row), ownerName: "" }))
    .map((view) => ({ ...view, ownerName: owners.get(view.clientId) ?? "" }))
    .filter((item) => (options.clientId ? item.clientId === options.clientId : true))
    .filter((item) => matches(item, options.query ?? ""))
    .sort((a, b) => a.name.localeCompare(b.name, "hu"));
}

export async function getPatient(db: LocalDatabase, id: string): Promise<PatientView | null> {
  const row = await db.patients.get(id);
  return row && !isDeleted(row) ? patientOps.viewOf(row) : null;
}

export async function createPatient(
  db: LocalDatabase,
  organizationId: string,
  fields: PatientFields,
  id: string = crypto.randomUUID(),
): Promise<string> {
  await db.patients.put(patientOps.newLocal(id, organizationId, fields, Date.now()));
  return id;
}

/** The species is fixed once a patient exists, so it is never part of an edit. */
export async function updatePatient(
  db: LocalDatabase,
  id: string,
  fields: Partial<Omit<PatientFields, "species">>,
): Promise<void> {
  await db.transaction("rw", db.patients, async () => {
    const row = await db.patients.get(id);
    if (row) await db.patients.put(patientOps.editLocal(row, fields, Date.now()));
  });
}

export async function removePatient(db: LocalDatabase, id: string): Promise<void> {
  await db.transaction("rw", db.patients, async () => {
    const row = await db.patients.get(id);
    if (!row) return;
    const next = patientOps.deleteLocal(row, Date.now());
    if (next === null) await db.patients.delete(id);
    else await db.patients.put(next);
  });
}
