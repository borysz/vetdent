import type { LocalDatabase } from "./local-db";
import { patientOps } from "./patients-model";
import { isDeleted } from "./record-model";
import { EMPTY_VISIT_FIELDS, statusOf, visitOps, type VisitFields, type VisitView } from "./visits-model";

/**
 * Reading and writing visits on the device. Every write is local and
 * immediate; the sync engine sends it when it can. A final visit is never
 * written to here: the screen does not offer it, and this refuses it too.
 */

export interface VisitListItem extends VisitView {
  patientName: string;
}

/** The visits of one patient, newest first. */
export async function listVisitsOfPatient(db: LocalDatabase, patientId: string): Promise<VisitView[]> {
  // The patient id is part of the record (server copy or pending), not a column, so it is matched here.
  const rows = await db.visits.toArray();
  return rows
    .filter((row) => !isDeleted(row))
    .map((row) => visitOps.viewOf(row))
    .filter((view) => view.patientId === patientId)
    .sort((a, b) => b.visitDate.localeCompare(a.visitDate) || a.id.localeCompare(b.id));
}

/** Drafts of the organization, newest first (for the dashboard: work left unfinished). */
export async function listDraftVisits(db: LocalDatabase, organizationId: string, limit: number): Promise<VisitListItem[]> {
  const [visitRows, patientRows] = await Promise.all([
    db.visits.where("organizationId").equals(organizationId).toArray(),
    db.patients.where("organizationId").equals(organizationId).toArray(),
  ]);
  const names = new Map(patientRows.map((row) => [row.id, patientOps.viewOf(row).name]));

  return visitRows
    .filter((row) => !isDeleted(row) && statusOf(row) === "draft")
    .map((row) => visitOps.viewOf(row))
    .sort((a, b) => b.visitDate.localeCompare(a.visitDate))
    .slice(0, limit)
    .map((view) => ({ ...view, patientName: names.get(view.patientId) ?? "" }));
}

export async function getVisit(db: LocalDatabase, id: string): Promise<VisitView | null> {
  const row = await db.visits.get(id);
  return row && !isDeleted(row) ? visitOps.viewOf(row) : null;
}

/** Starts a draft for a patient; the rest is filled in on the visit screen. */
export async function createVisit(
  db: LocalDatabase,
  organizationId: string,
  patientId: string,
  visitDate: string,
  id: string = crypto.randomUUID(),
): Promise<string> {
  const fields: VisitFields = { ...EMPTY_VISIT_FIELDS, patientId, visitDate };
  await db.visits.put(visitOps.newLocal(id, organizationId, fields, Date.now()));
  return id;
}

/** The patient cannot change after creation, so it is never part of an edit. Final visits are not edited. */
export async function updateVisit(
  db: LocalDatabase,
  id: string,
  fields: Partial<Omit<VisitFields, "patientId">>,
): Promise<void> {
  await db.transaction("rw", db.visits, async () => {
    const row = await db.visits.get(id);
    if (!row || statusOf(row) === "final") return;
    await db.visits.put(visitOps.editLocal(row, fields, Date.now()));
  });
}

/** Only a draft can be deleted. */
export async function removeVisit(db: LocalDatabase, id: string): Promise<void> {
  await db.transaction("rw", db.visits, async () => {
    const row = await db.visits.get(id);
    if (!row || statusOf(row) === "final") return;
    const next = visitOps.deleteLocal(row, Date.now());
    if (next === null) await db.visits.delete(id);
    else await db.visits.put(next);
  });
}
