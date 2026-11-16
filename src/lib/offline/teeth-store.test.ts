import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { EMPTY_MARKS, withFinding, withProcedure, type ToothMarks } from "@/domain/dental/chart";
import { LocalDatabase } from "./local-db";
import type { PushResult, WireChange } from "./record-model";
import { SyncError, syncAll, type SyncApi } from "./sync-engine";
import { toothRecordId } from "./teeth-id";
import { carryOverToNewVisit, loadChart, saveTooth, saveTeeth } from "./teeth-store";
import type { ServerTooth } from "./teeth-model";
import { EMPTY_VISIT_FIELDS, visitOps, type ServerVisit } from "./visits-model";

const ORG = "org-1";
const PATIENT = "patient-1";
const VISIT = "visit-1";

let db: LocalDatabase;
let counter = 0;

beforeEach(() => {
  counter += 1;
  db = new LocalDatabase(`teeth-test-${counter}`);
});

afterEach(async () => {
  db.close();
  await db.delete();
});

/** Puts a visit on the device the way the server last told us about it. */
async function putVisit(id: string, options: { status: "draft" | "final"; date: string; known?: boolean; patientId?: string }) {
  const fields = { ...EMPTY_VISIT_FIELDS, patientId: options.patientId ?? PATIENT, visitDate: options.date };
  const row = visitOps.newLocal(id, ORG, fields, 1);
  if (options.known === false) {
    await db.visits.put(row);
    return;
  }
  const server: ServerVisit = {
    ...fields,
    id,
    rev: 1,
    seq: 1,
    deletedAt: null,
    updatedAt: "2026-11-16T10:00:00Z",
    status: options.status,
    finalizedAt: options.status === "final" ? `${options.date}T12:00:00Z` : null,
  };
  await db.visits.put({ ...row, server, pending: {}, pendingBaseRev: null });
}

const marksOf = async (visitId: string, tooth: number): Promise<ToothMarks | undefined> => (await loadChart(db, visitId)).get(tooth)?.marks;

describe("charting a tooth on the device", () => {
  test("a first mark creates the record under the derived id, and it is read back by visit", async () => {
    await putVisit(VISIT, { status: "draft", date: "2026-11-16" });
    await saveTooth(db, ORG, VISIT, 104, { marks: withFinding(EMPTY_MARKS, "T", "2"), note: " óvatosan " });

    const rows = await db.teeth.toArray();
    expect(rows.map((row) => row.id)).toEqual([toothRecordId(VISIT, 104)]);
    const chart = await loadChart(db, VISIT);
    expect(chart.get(104)).toMatchObject({
      marks: { findings: [{ code: "T", level: "2" }], procedures: [] },
      note: "óvatosan",
      hasPendingChanges: true,
    });
  });

  test("a second change edits the same record and keeps the rest", async () => {
    await putVisit(VISIT, { status: "draft", date: "2026-11-16" });
    await saveTooth(db, ORG, VISIT, 104, { marks: withFinding(EMPTY_MARKS, "T", "2") });
    await saveTooth(db, ORG, VISIT, 104, { pockets: [3, 5, 3, null, 2, 4] });

    expect(await db.teeth.count()).toBe(1);
    expect((await loadChart(db, VISIT)).get(104)).toMatchObject({
      marks: { findings: [{ code: "T", level: "2" }] },
      pockets: [3, 5, 3, null, 2, 4],
    });
  });

  test("a bulk change writes every selected tooth", async () => {
    await putVisit(VISIT, { status: "draft", date: "2026-11-16" });
    const marks = withFinding(EMPTY_MARKS, "FX", "C");
    await saveTeeth(db, ORG, VISIT, new Map([[104, { marks }], [204, { marks }], [304, { marks }]]));
    expect([...(await loadChart(db, VISIT)).keys()].sort()).toEqual([104, 204, 304]);
  });

  test("the teeth of another visit are not mixed in", async () => {
    await putVisit(VISIT, { status: "draft", date: "2026-11-16" });
    await putVisit("visit-2", { status: "draft", date: "2026-11-17" });
    await saveTooth(db, ORG, VISIT, 104, { marks: withFinding(EMPTY_MARKS, "T", "1") });
    await saveTooth(db, ORG, "visit-2", 204, { marks: withFinding(EMPTY_MARKS, "G", "1") });
    expect([...(await loadChart(db, VISIT)).keys()]).toEqual([104]);
  });

  test("the chart of a final visit is not written", async () => {
    await putVisit(VISIT, { status: "final", date: "2026-11-10" });
    await saveTooth(db, ORG, VISIT, 104, { marks: withFinding(EMPTY_MARKS, "T", "1") });
    expect(await db.teeth.count()).toBe(0);
  });
});

describe("the chart of a new visit", () => {
  test("takes over what stays true from the previous final visit, and nothing else", async () => {
    await putVisit("old", { status: "draft", date: "2026-10-01" });
    await saveTeeth(db, ORG, "old", new Map<number, { marks: ToothMarks }>([
      [101, { marks: withFinding(EMPTY_MARKS, "M", "imp") }],
      [102, { marks: withProcedure(EMPTY_MARKS, "EXT", "S", "done") }],
      [103, { marks: withProcedure(EMPTY_MARKS, "EXT", "S", "planned") }],
      [104, { marks: withProcedure(EMPTY_MARKS, "ENDO", "closed", "done") }],
      [105, { marks: withProcedure(EMPTY_MARKS, "ENDO", "open", "planned") }],
      [106, { marks: withFinding(EMPTY_MARKS, "PD", "3") }],
    ]));
    await putVisit("old", { status: "final", date: "2026-10-01" });
    await putVisit("new", { status: "draft", date: "2026-11-16" });

    expect(await carryOverToNewVisit(db, ORG, PATIENT, "new")).toBe(3);
    expect(await marksOf("new", 101)).toEqual({ findings: [{ code: "M", level: "imp" }], procedures: [] });
    expect(await marksOf("new", 102)).toEqual({ findings: [{ code: "M", level: "prev" }], procedures: [] });
    expect(await marksOf("new", 104)).toEqual({ findings: [], procedures: [{ code: "ENDO", level: "closed", state: "done" }] });
    expect(await marksOf("new", 103)).toBeUndefined();
    expect(await marksOf("new", 105)).toBeUndefined();
    expect(await marksOf("new", 106)).toBeUndefined();
  });

  test("takes the newest final visit, ignores drafts and other patients, and does not run twice", async () => {
    for (const [id, date, patientId] of [
      ["older", "2026-09-01", PATIENT],
      ["newer", "2026-10-01", PATIENT],
      ["other", "2026-10-15", "patient-2"],
    ] as const) {
      await putVisit(id, { status: "draft", date, patientId });
      await saveTooth(db, ORG, id, 101, { marks: withFinding(EMPTY_MARKS, "M", id === "newer" ? "imp" : "missing") });
      await putVisit(id, { status: "final", date, patientId });
    }
    await putVisit("draft", { status: "draft", date: "2026-10-20" });
    await saveTooth(db, ORG, "draft", 102, { marks: withFinding(EMPTY_MARKS, "M", "missing") });
    await putVisit("new", { status: "draft", date: "2026-11-16" });

    expect(await carryOverToNewVisit(db, ORG, PATIENT, "new")).toBe(1);
    expect(await marksOf("new", 101)).toEqual({ findings: [{ code: "M", level: "imp" }], procedures: [] });
    expect(await marksOf("new", 102)).toBeUndefined();
    expect(await carryOverToNewVisit(db, ORG, PATIENT, "new")).toBe(0);
  });

  test("a patient without an earlier final visit starts with an empty chart", async () => {
    await putVisit("new", { status: "draft", date: "2026-11-16" });
    expect(await carryOverToNewVisit(db, ORG, PATIENT, "new")).toBe(0);
    expect(await db.teeth.count()).toBe(0);
  });
});

/** A server that knows the visits it is told about and records teeth. */
class FakeTeethServer implements SyncApi {
  teeth = new Map<string, ServerTooth>();
  nextSeq = 1;
  down = false;
  lockedVisits = new Set<string>();

  async pushClients(): Promise<PushResult[]> {
    return [];
  }
  async pullClients(): Promise<never[]> {
    return [];
  }
  async pushPatients(): Promise<PushResult[]> {
    return [];
  }
  async pullPatients(): Promise<never[]> {
    return [];
  }
  async pushVisits(changes: WireChange[]): Promise<PushResult[]> {
    return changes.map((change) => ({ id: change.id, status: "applied", rev: 1 }));
  }
  async pullVisits(): Promise<never[]> {
    return [];
  }
  async pushTemplates(): Promise<PushResult[]> {
    return [];
  }
  async pullTemplates(): Promise<never[]> {
    return [];
  }

  async pushTeeth(changes: WireChange[]): Promise<PushResult[]> {
    if (this.down) throw new SyncError("offline");
    return changes.map((change) => {
      const visitId = String(change.fields.visit_id ?? this.teeth.get(change.id)?.visitId ?? "");
      if (this.lockedVisits.has(visitId)) return { id: change.id, status: "locked" };
      const existing = this.teeth.get(change.id);
      const rev = (existing?.rev ?? 0) + 1;
      const f = change.fields;
      this.teeth.set(change.id, {
        id: change.id,
        visitId: visitId,
        tooth: Number(f.tooth ?? existing?.tooth),
        findings: String(f.findings ?? existing?.findings ?? "[]"),
        procedures: String(f.procedures ?? existing?.procedures ?? "[]"),
        pockets: String(f.pockets ?? existing?.pockets ?? "[]"),
        note: (f.note as string | null | undefined) ?? existing?.note ?? null,
        rev,
        seq: this.nextSeq++,
        deletedAt: null,
        updatedAt: new Date().toISOString(),
      });
      return { id: change.id, status: "applied", rev };
    });
  }

  async pullTeeth(afterSeq: number, limit: number): Promise<ServerTooth[]> {
    if (this.down) throw new SyncError("offline");
    return [...this.teeth.values()].filter((tooth) => tooth.seq > afterSeq).sort((a, b) => a.seq - b.seq).slice(0, limit);
  }
}

describe("synchronising the chart", () => {
  test("a chart made offline reaches the server, and the device keeps showing it", async () => {
    await putVisit(VISIT, { status: "draft", date: "2026-11-16" });
    const server = new FakeTeethServer();
    await saveTooth(db, ORG, VISIT, 104, { marks: withFinding(EMPTY_MARKS, "FX", "C"), pockets: [3, 5, 3, null, 2, 4] });

    server.down = true;
    expect((await syncAll(db, ORG, server)).error?.kind).toBe("offline");
    expect((await loadChart(db, VISIT)).get(104)?.hasPendingChanges).toBe(true);

    server.down = false;
    expect((await syncAll(db, ORG, server)).error).toBeNull();
    expect(server.teeth.get(toothRecordId(VISIT, 104))).toMatchObject({ tooth: 104, visitId: VISIT, pockets: "[3,5,3,null,2,4]" });
    expect((await loadChart(db, VISIT)).get(104)).toMatchObject({
      hasPendingChanges: false,
      marks: { findings: [{ code: "FX", level: "C" }] },
    });
  });

  test("a tooth is received for a visit made on another device, and found by index", async () => {
    await putVisit(VISIT, { status: "draft", date: "2026-11-16" });
    const server = new FakeTeethServer();
    server.teeth.set("t-1", {
      id: "t-1",
      visitId: VISIT,
      tooth: 208,
      findings: '[{"code":"G","level":"2"}]',
      procedures: "[]",
      pockets: "[]",
      note: null,
      rev: 1,
      seq: 1,
      deletedAt: null,
      updatedAt: "2026-11-16T10:00:00Z",
    });

    await syncAll(db, ORG, server);
    expect((await loadChart(db, VISIT)).get(208)?.marks.findings).toEqual([{ code: "G", level: "2" }]);
  });

  test("a tooth waits while its visit is unknown to the server", async () => {
    await putVisit(VISIT, { status: "draft", date: "2026-11-16", known: false });
    const server = new FakeTeethServer();
    await saveTooth(db, ORG, VISIT, 104, { marks: withFinding(EMPTY_MARKS, "T", "1") });
    // The visit goes out in the same round (visits come before teeth), so the tooth follows it at once.
    await syncAll(db, ORG, server);
    expect(server.teeth.size).toBe(1);
  });

  test("an edit to a tooth of a visit finalised meanwhile is dropped, and the final copy is shown", async () => {
    await putVisit(VISIT, { status: "draft", date: "2026-11-16" });
    const server = new FakeTeethServer();
    await saveTooth(db, ORG, VISIT, 104, { marks: withFinding(EMPTY_MARKS, "T", "1") });
    await syncAll(db, ORG, server);

    await saveTooth(db, ORG, VISIT, 104, { marks: withFinding(EMPTY_MARKS, "PD", "3") });
    server.lockedVisits.add(VISIT);
    await syncAll(db, ORG, server);

    expect((await loadChart(db, VISIT)).get(104)).toMatchObject({
      hasPendingChanges: false,
      problem: null,
      marks: { findings: [{ code: "T", level: "1" }] },
    });
  });
});
