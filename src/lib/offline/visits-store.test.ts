import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { LocalDatabase } from "./local-db";
import type { PushResult, WireChange } from "./record-model";
import { SyncError, syncAll, type SyncApi } from "./sync-engine";
import { serializeMedications } from "./visit-lists";
import { createVisit, getVisit, listDraftVisits, listVisitsOfPatient, removeVisit, updateVisit } from "./visits-store";
import { visitOps, type ServerVisit, type VisitFields } from "./visits-model";
import { patientOps, EMPTY_PATIENT_FIELDS } from "./patients-model";

const ORG = "org-1";
const PATIENT = "patient-1";

let db: LocalDatabase;
let counter = 0;

beforeEach(() => {
  counter += 1;
  db = new LocalDatabase(`visits-test-${counter}`);
});

afterEach(async () => {
  db.close();
  await db.delete();
});

/** A server that only knows visits; clients and patients are empty. */
class FakeVisitServer implements SyncApi {
  visits = new Map<string, ServerVisit>();
  nextSeq = 1;
  down = false;
  pushed: WireChange[][] = [];

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
    if (this.down) throw new SyncError("offline");
    this.pushed.push(changes);
    return changes.map((change) => {
      const existing = this.visits.get(change.id);
      // A finalised visit is not edited; the answer is "unchanged".
      if (existing?.status === "final") return { id: change.id, status: "unchanged", rev: existing.rev };

      const fields = Object.fromEntries(
        Object.entries(change.fields).map(([wire, value]) => [wireToCamel(wire), value]),
      ) as Partial<VisitFields>;
      const rev = (existing?.rev ?? 0) + 1;
      this.visits.set(change.id, {
        ...visitOps.spec.empty,
        ...existing,
        ...fields,
        id: change.id,
        status: "draft",
        finalizedAt: null,
        rev,
        seq: this.nextSeq++,
        deletedAt: change.op === "delete" ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      });
      return { id: change.id, status: "applied", rev };
    });
  }

  async pullVisits(afterSeq: number, limit: number): Promise<ServerVisit[]> {
    if (this.down) throw new SyncError("offline");
    return [...this.visits.values()]
      .filter((visit) => visit.seq > afterSeq)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit);
  }

  /** What the finalize function does on the server. */
  finalize(id: string): void {
    const visit = this.visits.get(id)!;
    this.visits.set(id, { ...visit, status: "final", finalizedAt: new Date().toISOString(), rev: visit.rev + 1, seq: this.nextSeq++ });
  }
}

function wireToCamel(wire: string): string {
  return wire.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

async function knownPatient(): Promise<void> {
  const fields = { ...EMPTY_PATIENT_FIELDS, clientId: "c", name: "Bodri" };
  const row = patientOps.newLocal(PATIENT, ORG, fields, 1);
  await db.patients.put({ ...row, server: { ...fields, id: PATIENT, rev: 1, seq: 1, deletedAt: null, updatedAt: "" }, pending: {} });
}

describe("a visit on the device", () => {
  test("starts as an empty draft of the patient", async () => {
    const id = await createVisit(db, ORG, PATIENT, "2026-11-16");
    const visit = await getVisit(db, id);

    expect(visit).toMatchObject({ patientId: PATIENT, visitDate: "2026-11-16", status: "draft", isNew: true, asaStatus: null });
    expect(visit?.complaintTags).toBe("[]");
  });

  test("an edit is kept at once and listed with the patient, newest first", async () => {
    const first = await createVisit(db, ORG, PATIENT, "2026-11-10");
    const second = await createVisit(db, ORG, PATIENT, "2026-11-16");
    await updateVisit(db, first, { asaStatus: 2, medications: serializeMedications([{ name: "Meloxicam" }]) });

    const list = await listVisitsOfPatient(db, PATIENT);
    expect(list.map((visit) => visit.id)).toEqual([second, first]);
    expect(list[1]).toMatchObject({ asaStatus: 2, hasPendingChanges: true });
  });

  test("a deleted draft disappears from the lists", async () => {
    const id = await createVisit(db, ORG, PATIENT, "2026-11-16");
    await removeVisit(db, id);
    expect(await listVisitsOfPatient(db, PATIENT)).toEqual([]);
  });

  test("drafts of the organization are listed with the patient's name", async () => {
    await knownPatient();
    await createVisit(db, ORG, PATIENT, "2026-11-16");
    const drafts = await listDraftVisits(db, ORG, 5);
    expect(drafts.map((draft) => draft.patientName)).toEqual(["Bodri"]);
  });
});

describe("synchronising visits", () => {
  test("a visit made offline reaches the server once the patient is known, and keeps its edits", async () => {
    await knownPatient();
    const server = new FakeVisitServer();
    const id = await createVisit(db, ORG, PATIENT, "2026-11-16");
    await updateVisit(db, id, { veterinarianName: "Dr. Kiss", asaStatus: 2 });

    server.down = true;
    expect((await syncAll(db, ORG, server)).error?.kind).toBe("offline");
    expect((await getVisit(db, id))?.hasPendingChanges).toBe(true);

    server.down = false;
    expect((await syncAll(db, ORG, server)).error).toBeNull();
    expect(server.visits.get(id)).toMatchObject({ veterinarianName: "Dr. Kiss", asaStatus: 2, patientId: PATIENT });
    expect(await getVisit(db, id)).toMatchObject({ hasPendingChanges: false, veterinarianName: "Dr. Kiss", status: "draft" });
  });

  test("a visit waits while its patient is unknown to the server", async () => {
    const server = new FakeVisitServer();
    // The patient exists only on this device.
    await db.patients.put(patientOps.newLocal(PATIENT, ORG, { ...EMPTY_PATIENT_FIELDS, clientId: "c", name: "Bodri" }, 1));
    const id = await createVisit(db, ORG, PATIENT, "2026-11-16");

    await syncAll(db, ORG, server);
    expect(server.visits.has(id)).toBe(false);
    expect((await getVisit(db, id))?.hasPendingChanges).toBe(true);
  });

  test("when the server has finalised the visit, the device shows it as final and no longer edits it", async () => {
    await knownPatient();
    const server = new FakeVisitServer();
    const id = await createVisit(db, ORG, PATIENT, "2026-11-16");
    await syncAll(db, ORG, server);

    server.finalize(id);
    await syncAll(db, ORG, server);
    expect(await getVisit(db, id)).toMatchObject({ status: "final" });

    await updateVisit(db, id, { sutures: "should not be written" });
    expect((await getVisit(db, id))?.sutures).toBeNull();

    await removeVisit(db, id);
    expect(await getVisit(db, id)).not.toBeNull();
  });

  test("a visit stays a draft after its own edits are acknowledged", async () => {
    await knownPatient();
    const server = new FakeVisitServer();
    const id = await createVisit(db, ORG, PATIENT, "2026-11-16");
    await syncAll(db, ORG, server);
    await updateVisit(db, id, { dietType: "száraztáp" });
    await syncAll(db, ORG, server);

    expect(await getVisit(db, id)).toMatchObject({ status: "draft", dietType: "száraztáp", hasPendingChanges: false });
  });
});
