import {
  carriedOver,
  isEmpty,
  parseFindings,
  parsePockets,
  parseProcedures,
  serializeFindings,
  serializePockets,
  serializeProcedures,
  type PocketDepths,
  type ToothMarks,
} from "@/domain/dental/chart";
import type { LocalDatabase } from "./local-db";
import { isDeleted } from "./record-model";
import { toothRecordId } from "./teeth-id";
import { EMPTY_TOOTH_FIELDS, toothOps, type LocalToothRow, type ToothFields, type ToothView } from "./teeth-model";
import { textOrNull } from "./visit-form";
import { statusOf, visitOps } from "./visits-model";

/**
 * Reading and writing the dental chart of a visit on the device. Every write
 * is local and immediate; the sync engine sends it when it can. The chart of a
 * final visit is never written to here, and this refuses it too.
 */

/** What is recorded on one tooth of a visit, in the form the screen works with. */
export interface ToothChart {
  marks: ToothMarks;
  pockets: PocketDepths;
  note: string;
  hasPendingChanges: boolean;
  /** The server refused the last change. */
  problem: ToothView["problem"];
}

/** The charted teeth of a visit, by Triadan number. A tooth nobody touched is absent. */
export type VisitChart = ReadonlyMap<number, ToothChart>;

export function chartOf(view: ToothView): ToothChart {
  return {
    marks: { findings: parseFindings(view.findings), procedures: parseProcedures(view.procedures) },
    pockets: parsePockets(view.pockets),
    note: view.note ?? "",
    hasPendingChanges: view.hasPendingChanges,
    problem: view.problem,
  };
}

export async function loadChart(db: LocalDatabase, visitId: string): Promise<VisitChart> {
  const rows = await db.teeth.where("visitId").equals(visitId).toArray();
  const chart = new Map<number, ToothChart>();
  for (const row of rows) {
    if (isDeleted(row)) continue;
    const view = toothOps.viewOf(row);
    chart.set(view.tooth, chartOf(view));
  }
  return chart;
}

async function visitIsFinal(db: LocalDatabase, visitId: string): Promise<boolean> {
  const visit = await db.visits.get(visitId);
  return visit !== undefined && statusOf(visit) === "final";
}

/** What of a tooth can be changed in one go; anything left out stays as it is. */
export interface ToothParts {
  marks?: ToothMarks;
  pockets?: PocketDepths;
  note?: string;
}

function fieldsOf(parts: ToothParts): Partial<ToothFields> {
  const fields: Partial<ToothFields> = {};
  if (parts.marks) {
    fields.findings = serializeFindings(parts.marks.findings);
    fields.procedures = serializeProcedures(parts.marks.procedures);
  }
  if (parts.pockets) fields.pockets = serializePockets(parts.pockets);
  if (parts.note !== undefined) fields.note = textOrNull(parts.note);
  return fields;
}

/**
 * Writes the changes of several teeth of one visit in one transaction (a bulk
 * action is one step, so it can be undone as one). A tooth that has no record
 * yet gets one, with the id every device derives for it.
 */
export async function saveTeeth(
  db: LocalDatabase,
  organizationId: string,
  visitId: string,
  changes: ReadonlyMap<number, ToothParts>,
): Promise<void> {
  const now = Date.now();
  await db.transaction("rw", db.teeth, db.visits, async () => {
    if (await visitIsFinal(db, visitId)) return;

    for (const [tooth, parts] of changes) {
      const id = toothRecordId(visitId, tooth);
      const fields = fieldsOf(parts);
      const existing = await db.teeth.get(id);

      if (existing) {
        await db.teeth.put(toothOps.editLocal(existing, fields, now));
      } else {
        const created: LocalToothRow = toothOps.newLocal(id, organizationId, { ...EMPTY_TOOTH_FIELDS, visitId, tooth, ...fields }, now);
        // `visitId` is stored beside the record so a visit's teeth are found by index.
        await db.teeth.put({ ...created, visitId } as LocalToothRow);
      }
    }
  });
}

export function saveTooth(
  db: LocalDatabase,
  organizationId: string,
  visitId: string,
  tooth: number,
  parts: ToothParts,
): Promise<void> {
  return saveTeeth(db, organizationId, visitId, new Map([[tooth, parts]]));
}

/**
 * Starts the chart of a new visit with what stays true from the patient's
 * previous FINAL visit: missing teeth, extracted teeth (now "extracted
 * earlier") and finished root canals. Does nothing if there is no such visit or
 * the new visit already has a chart.
 */
export async function carryOverToNewVisit(
  db: LocalDatabase,
  organizationId: string,
  patientId: string,
  newVisitId: string,
): Promise<number> {
  if ((await db.teeth.where("visitId").equals(newVisitId).count()) > 0) return 0;

  const visits = (await db.visits.toArray())
    .filter((row) => !isDeleted(row) && statusOf(row) === "final" && row.id !== newVisitId)
    .map((row) => ({ row, view: visitOps.viewOf(row) }))
    .filter(({ view }) => view.patientId === patientId)
    .sort((a, b) => b.view.visitDate.localeCompare(a.view.visitDate) || (b.view.finalizedAt ?? "").localeCompare(a.view.finalizedAt ?? ""));
  const previous = visits[0];
  if (!previous) return 0;

  const chart = await loadChart(db, previous.row.id);
  const carried = new Map<number, ToothParts>();
  for (const [tooth, entry] of chart) {
    const marks = carriedOver(entry.marks);
    if (marks && !isEmpty(marks)) carried.set(tooth, { marks });
  }
  if (carried.size === 0) return 0;

  await saveTeeth(db, organizationId, newVisitId, carried);
  return carried.size;
}
