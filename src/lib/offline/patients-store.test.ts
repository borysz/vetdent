import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { clientOps, type ClientFields } from "./clients-model";
import { LocalDatabase } from "./local-db";
import { type PatientFields } from "./patients-model";
import { createPatient, getPatient, listPatients, recentPatients, removePatient, updatePatient } from "./patients-store";
import { syncAll, type SyncApi } from "./sync-engine";
import type { PushResult, ServerRecord, WireChange } from "./record-model";

const ORG = "org-1";

const clientFields = (fullName: string): ClientFields => ({
  fullName,
  phone: null,
  email: null,
  address: null,
  notes: null,
  emailConsent: false,
});

const patientFields = (overrides: Partial<PatientFields> = {}): PatientFields => ({
  clientId: "owner-1",
  name: "Bodri",
  species: "dog",
  breed: "keverék",
  birthDate: null,
  sex: "male",
  neutered: false,
  weightKg: null,
  microchip: null,
  notes: null,
  ...overrides,
});

let db: LocalDatabase;
let counter = 0;

beforeEach(() => {
  counter += 1;
  db = new LocalDatabase(`patients-test-${counter}`);
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("the local list of patients", () => {
  test("shows each patient with its owner's name, sorted by name", async () => {
    await db.clients.put(clientOps.newLocal("owner-1", ORG, clientFields("Kovács Anna"), 1));
    await createPatient(db, ORG, patientFields({ name: "Zsemle" }));
    await createPatient(db, ORG, patientFields({ name: "Ábel" }));

    const list = await listPatients(db, ORG);
    expect(list.map((item) => [item.name, item.ownerName])).toEqual([
      ["Ábel", "Kovács Anna"],
      ["Zsemle", "Kovács Anna"],
    ]);
  });

  test("can be searched by name, breed, chip number and owner, and narrowed to one owner", async () => {
    await db.clients.put(clientOps.newLocal("owner-1", ORG, clientFields("Kovács Anna"), 1));
    await db.clients.put(clientOps.newLocal("owner-2", ORG, clientFields("Nagy Béla"), 2));
    await createPatient(db, ORG, patientFields({ name: "Bodri", breed: "puli", microchip: "985112345678901" }));
    await createPatient(db, ORG, patientFields({ name: "Cirmi", clientId: "owner-2", species: "cat", breed: "perzsa" }));

    expect((await listPatients(db, ORG, { query: "PULI" })).map((item) => item.name)).toEqual(["Bodri"]);
    expect((await listPatients(db, ORG, { query: "98511" })).map((item) => item.name)).toEqual(["Bodri"]);
    expect((await listPatients(db, ORG, { query: "nagy" })).map((item) => item.name)).toEqual(["Cirmi"]);
    expect((await listPatients(db, ORG, { clientId: "owner-1" })).map((item) => item.name)).toEqual(["Bodri"]);
  });

  test("other organizations' patients never appear", async () => {
    await createPatient(db, ORG, patientFields());
    await createPatient(db, "org-2", patientFields({ name: "Idegen" }));
    expect((await listPatients(db, ORG)).map((item) => item.name)).toEqual(["Bodri"]);
  });
});

describe("recent patients", () => {
  test("newest first, limited, without deleted ones", async () => {
    const oldest = await createPatient(db, ORG, patientFields({ name: "Régi" }));
    const middle = await createPatient(db, ORG, patientFields({ name: "Közepes" }));
    const newest = await createPatient(db, ORG, patientFields({ name: "Új" }));
    const gone = await createPatient(db, ORG, patientFields({ name: "Törölt" }));
    await db.patients.update(oldest, { touchedAt: 100 });
    await db.patients.update(middle, { touchedAt: 200 });
    await db.patients.update(newest, { touchedAt: 300 });
    await db.patients.update(gone, { touchedAt: 400 });
    await removePatient(db, gone);

    expect((await recentPatients(db, ORG, 2)).map((item) => item.name)).toEqual(["Új", "Közepes"]);
  });

  test("an edit moves a patient to the top", async () => {
    const first = await createPatient(db, ORG, patientFields({ name: "Első" }));
    const second = await createPatient(db, ORG, patientFields({ name: "Második" }));
    await db.patients.update(first, { touchedAt: 100 });
    await db.patients.update(second, { touchedAt: 200 });

    await updatePatient(db, first, { notes: "módosítva" });
    expect((await recentPatients(db, ORG, 5))[0].name).toBe("Első");
  });
});

describe("editing and deleting on the device", () => {
  test("edits show up at once", async () => {
    const id = await createPatient(db, ORG, patientFields());
    await updatePatient(db, id, { weightKg: 18.5 });
    expect(await getPatient(db, id)).toMatchObject({ weightKg: 18.5, hasPendingChanges: true });
  });

  test("a patient that never left the device vanishes when deleted", async () => {
    const id = await createPatient(db, ORG, patientFields());
    await removePatient(db, id);
    expect(await getPatient(db, id)).toBeNull();
  });
});

/** A server that only records what it is sent, and refuses a patient whose owner it has not seen yet. */
class OrderCheckingServer implements SyncApi {
  async pushVisits(): Promise<PushResult[]> {
    return [];
  }
  async pullVisits(): Promise<never[]> {
    return [];
  }

  async pushTeeth(): Promise<PushResult[]> {
    return [];
  }
  async pullTeeth(): Promise<never[]> {
    return [];
  }

  clientIds = new Set<string>();
  patientIds = new Set<string>();
  log: string[] = [];

  async pushClients(changes: WireChange[]): Promise<PushResult[]> {
    for (const change of changes) {
      this.clientIds.add(change.id);
      this.log.push(`client:${change.id}`);
    }
    return changes.map((change) => ({ id: change.id, status: "applied", rev: 1 }));
  }

  async pushPatients(changes: WireChange[]): Promise<PushResult[]> {
    return changes.map((change) => {
      const owner = change.fields["client_id"];
      if (typeof owner !== "string" || !this.clientIds.has(owner)) return { id: change.id, status: "invalid" };
      this.patientIds.add(change.id);
      this.log.push(`patient:${change.id}`);
      return { id: change.id, status: "applied", rev: 1 };
    });
  }

  async pullClients(): Promise<never[]> {
    return [];
  }

  async pullPatients(): Promise<ServerRecord<PatientFields>[]> {
    return [];
  }
}

describe("sending everything", () => {
  test("a patient created offline together with its owner is sent after the owner", async () => {
    const owner = "owner-new";
    await db.clients.put(clientOps.newLocal(owner, ORG, clientFields("Új Gazdi"), 100));
    // The patient was edited *earlier* than the client – the order of sending must not depend on that.
    const patientId = await createPatient(db, ORG, patientFields({ clientId: owner, name: "Elsőként" }));
    await db.patients.update(patientId, { touchedAt: 1 });

    const server = new OrderCheckingServer();
    const outcome = await syncAll(db, ORG, server);

    expect(outcome).toMatchObject({ pushed: 2, refused: 0, error: null });
    expect(server.log).toEqual([`client:${owner}`, `patient:${patientId}`]);
  });

  test("a patient waits while its owner is refused – and goes out once the owner has been corrected", async () => {
    const server = new OrderCheckingServer();
    const refuseOwners = server.pushClients.bind(server);
    server.pushClients = async (changes) => changes.map((change) => ({ id: change.id, status: "invalid" as const }));

    await db.clients.put(clientOps.newLocal("owner-bad", ORG, clientFields("Rossz"), 1));
    const patientId = await createPatient(db, ORG, patientFields({ clientId: "owner-bad" }));

    const first = await syncAll(db, ORG, server);
    expect(first.refused).toBe(1);
    expect(server.patientIds.size).toBe(0);

    // Not attempted, not flagged, nothing lost: it is simply still waiting.
    const waiting = await db.patients.get(patientId);
    expect(waiting?.problem).toBeNull();
    expect(waiting?.pending.name).toBe("Bodri");

    // The owner is corrected and accepted; now the patient follows.
    server.pushClients = refuseOwners;
    const owner = (await db.clients.get("owner-bad"))!;
    await db.clients.put(clientOps.editLocal(owner, { fullName: "Javított Gazdi" }, 50));
    const second = await syncAll(db, ORG, server);

    expect(second).toMatchObject({ pushed: 2, refused: 0 });
    expect(server.patientIds.has(patientId)).toBe(true);
  });
});
