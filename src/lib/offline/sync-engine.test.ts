import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  deleteLocalClient,
  editLocalClient,
  newLocalClient,
  viewOf,
  type ClientFields,
  type PushResult,
  type ServerClient,
  type WireChange,
} from "./clients-model";
import { LocalDatabase, META_KEYS, readMeta } from "./local-db";
import { countPending, syncClients, SyncError, type SyncApi } from "./sync-engine";

const ORG = "org-1";
const WIRE_TO_FIELD: Record<string, keyof ClientFields> = {
  full_name: "fullName",
  phone: "phone",
  email: "email",
  address: "address",
  notes: "notes",
  email_consent: "emailConsent",
};

/** A tiny stand-in for the server: same shape of answers, none of the merge rules (those are tested against the real database). */
class FakeServer implements SyncApi {
  records = new Map<string, ServerClient>();
  nextSeq = 1;
  down = false;
  pushCalls: WireChange[][] = [];
  pullCalls: number[] = [];
  /** Called once between receiving a push and answering it – used to simulate edits made during the push. */
  duringPush: (() => Promise<void>) | null = null;
  refuse = new Set<string>();

  async pushClients(changes: WireChange[]): Promise<PushResult[]> {
    if (this.down) throw new SyncError("offline");
    this.pushCalls.push(changes);

    const results: PushResult[] = changes.map((change) => {
      if (this.refuse.has(change.id)) return { id: change.id, status: "invalid" };

      const existing = this.records.get(change.id);
      if (change.op === "delete") {
        if (!existing || existing.deletedAt) return { id: change.id, status: "unchanged", rev: existing?.rev };
        const rev = existing.rev + 1;
        this.records.set(change.id, { ...existing, rev, seq: this.nextSeq++, deletedAt: "2026-11-16T12:00:00Z" });
        return { id: change.id, status: "applied", rev };
      }
      if (existing?.deletedAt) return { id: change.id, status: "deleted", rev: existing.rev };

      const patch: Partial<ClientFields> = {};
      for (const [wire, value] of Object.entries(change.fields)) {
        (patch as Record<string, unknown>)[WIRE_TO_FIELD[wire]] = value;
      }
      const rev = (existing?.rev ?? 0) + 1;
      this.records.set(change.id, {
        id: change.id,
        fullName: "",
        phone: null,
        email: null,
        address: null,
        notes: null,
        emailConsent: false,
        ...existing,
        ...patch,
        rev,
        seq: this.nextSeq++,
        deletedAt: null,
        updatedAt: "2026-11-16T12:00:00Z",
      });
      return { id: change.id, status: "applied", rev };
    });

    if (this.duringPush) {
      const hook = this.duringPush;
      this.duringPush = null;
      await hook();
    }
    return results;
  }

  // Patients are exercised in the "patients" tests below; the client tests do not use them.
  async pushPatients(): Promise<PushResult[]> {
    return [];
  }

  async pullPatients(): Promise<never[]> {
    return [];
  }

  async pullClients(afterSeq: number, limit: number): Promise<ServerClient[]> {
    if (this.down) throw new SyncError("offline");
    this.pullCalls.push(afterSeq);
    return [...this.records.values()]
      .filter((record) => record.seq > afterSeq)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit);
  }

  /** What another device would do. */
  seed(record: Partial<ServerClient> & { id: string }) {
    this.records.set(record.id, {
      fullName: "Szerver Gazdi",
      phone: null,
      email: null,
      address: null,
      notes: null,
      emailConsent: false,
      rev: 1,
      seq: this.nextSeq++,
      deletedAt: null,
      updatedAt: "2026-11-16T09:00:00Z",
      ...record,
    });
  }
}

const fields = (overrides: Partial<ClientFields> = {}): ClientFields => ({
  fullName: "Kovács Anna",
  phone: "111",
  email: null,
  address: null,
  notes: null,
  emailConsent: false,
  ...overrides,
});

let db: LocalDatabase;
let server: FakeServer;
let counter = 0;

beforeEach(() => {
  counter += 1;
  db = new LocalDatabase(`test-${counter}`);
  server = new FakeServer();
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("working offline", () => {
  test("records created while offline are sent when the connection returns", async () => {
    await db.clients.put(newLocalClient("c1", ORG, fields(), 1));
    await db.clients.put(newLocalClient("c2", ORG, fields({ fullName: "Nagy Béla" }), 2));

    server.down = true;
    const offline = await syncClients(db, ORG, server);
    expect(offline.error?.kind).toBe("offline");
    expect(await countPending(db)).toEqual({ pending: 2, problems: 0 });
    expect(server.records.size).toBe(0);

    server.down = false;
    const online = await syncClients(db, ORG, server);
    expect(online).toMatchObject({ pushed: 2, refused: 0, error: null });
    expect(await countPending(db)).toEqual({ pending: 0, problems: 0 });
    expect([...server.records.keys()].sort()).toEqual(["c1", "c2"]);
  });

  test("a failed round loses nothing and the next one picks up exactly where it left off", async () => {
    await db.clients.put(newLocalClient("c1", ORG, fields(), 1));
    server.down = true;
    await syncClients(db, ORG, server);
    await syncClients(db, ORG, server);
    server.down = false;
    await syncClients(db, ORG, server);
    await syncClients(db, ORG, server);

    expect(server.records.get("c1")?.rev).toBe(1);
    expect(server.pushCalls.flat().filter((change) => change.id === "c1")).toHaveLength(1);
  });

  test("sending is idempotent: nothing is sent twice once it was acknowledged", async () => {
    await db.clients.put(newLocalClient("c1", ORG, fields(), 1));
    await syncClients(db, ORG, server);
    const calls = server.pushCalls.length;
    const again = await syncClients(db, ORG, server);
    expect(again.pushed).toBe(0);
    expect(server.pushCalls.length).toBe(calls);
  });
});

describe("receiving", () => {
  test("changes from other devices arrive, and the cursor moves forward", async () => {
    server.seed({ id: "x1", fullName: "Egyik" });
    server.seed({ id: "x2", fullName: "Másik" });

    const outcome = await syncClients(db, ORG, server);
    expect(outcome.pulled).toBe(2);
    expect((await db.clients.get("x1"))?.server?.fullName).toBe("Egyik");
    expect(await readMeta(db, META_KEYS.clientsCursor)).toBe(2);
    expect(await readMeta(db, META_KEYS.lastSyncAt)).toBeGreaterThan(0);
  });

  test("a second round only fetches what is new (with a small overlap)", async () => {
    server.seed({ id: "x1" });
    await syncClients(db, ORG, server);
    server.seed({ id: "x2" });

    const outcome = await syncClients(db, ORG, server);
    expect(outcome.pulled).toBe(1);
    expect(server.pullCalls.at(-1)).toBe(0);
  });

  test("a deletion on another device arrives as a tombstone", async () => {
    server.seed({ id: "x1" });
    await syncClients(db, ORG, server);
    server.seed({ id: "x1", rev: 2, deletedAt: "2026-11-16T11:00:00Z" });
    await syncClients(db, ORG, server);

    expect((await db.clients.get("x1"))?.server?.deletedAt).not.toBeNull();
  });

  test("a large backlog is fetched page by page", async () => {
    for (let index = 0; index < 1203; index += 1) server.seed({ id: `r${index}` });
    const outcome = await syncClients(db, ORG, server);
    expect(outcome.pulled).toBe(1203);
    expect(await db.clients.count()).toBe(1203);
  });
});

describe("editing and deleting", () => {
  test("an edit of a known record is sent as a change of just that field", async () => {
    server.seed({ id: "c1", fullName: "Kovács Anna", phone: "111" });
    await syncClients(db, ORG, server);

    const row = (await db.clients.get("c1"))!;
    await db.clients.put(editLocalClient(row, { phone: "222" }, 5));
    await syncClients(db, ORG, server);

    expect(server.pushCalls.at(-1)).toEqual([{ id: "c1", op: "upsert", base_rev: 1, fields: { phone: "222" } }]);
    expect(server.records.get("c1")).toMatchObject({ phone: "222", fullName: "Kovács Anna", rev: 2 });
  });

  test("a delete is sent and the record becomes a tombstone", async () => {
    server.seed({ id: "c1" });
    await syncClients(db, ORG, server);
    await db.clients.put(deleteLocalClient((await db.clients.get("c1"))!, 5)!);
    await syncClients(db, ORG, server);

    expect(server.records.get("c1")?.deletedAt).not.toBeNull();
    expect((await db.clients.get("c1"))?.pendingDelete).toBe(false);
  });

  test("an edit that the server refuses stays on the device, flagged, and is not sent again", async () => {
    await db.clients.put(newLocalClient("c1", ORG, fields(), 1));
    server.refuse.add("c1");

    const first = await syncClients(db, ORG, server);
    expect(first.refused).toBe(1);
    expect(await countPending(db)).toEqual({ pending: 0, problems: 1 });
    expect(viewOf((await db.clients.get("c1"))!).fullName).toBe("Kovács Anna");

    const calls = server.pushCalls.length;
    await syncClients(db, ORG, server);
    expect(server.pushCalls.length).toBe(calls);

    // Correcting it makes it eligible again.
    server.refuse.clear();
    await db.clients.put(editLocalClient((await db.clients.get("c1"))!, { fullName: "Javított" }, 9));
    await syncClients(db, ORG, server);
    expect(server.records.get("c1")?.fullName).toBe("Javított");
  });
});

describe("edits made while a send is in flight", () => {
  test("the new edit is kept and sent in the next round – never swallowed by the acknowledgement", async () => {
    await db.clients.put(newLocalClient("c1", ORG, fields({ phone: "111" }), 1));

    server.duringPush = async () => {
      const row = (await db.clients.get("c1"))!;
      await db.clients.put(editLocalClient(row, { phone: "999" }, 50));
    };
    await syncClients(db, ORG, server);

    // The first round carried phone 111; the edit made meanwhile is still pending.
    expect(server.records.get("c1")?.phone).toBe("111");
    expect(viewOf((await db.clients.get("c1"))!)).toMatchObject({ phone: "999", hasPendingChanges: true });

    await syncClients(db, ORG, server);
    expect(server.records.get("c1")?.phone).toBe("999");
    expect(await countPending(db)).toEqual({ pending: 0, problems: 0 });
  });

  test("a delete requested during the send is not lost either", async () => {
    server.seed({ id: "c1", phone: "1" });
    await syncClients(db, ORG, server);
    await db.clients.put(editLocalClient((await db.clients.get("c1"))!, { phone: "2" }, 5));

    server.duringPush = async () => {
      await db.clients.put(deleteLocalClient((await db.clients.get("c1"))!, 60)!);
    };
    await syncClients(db, ORG, server);
    expect((await db.clients.get("c1"))?.pendingDelete).toBe(true);

    await syncClients(db, ORG, server);
    expect(server.records.get("c1")?.deletedAt).not.toBeNull();
  });
});

describe("sending order", () => {
  test("the oldest edits go first", async () => {
    await db.clients.put(newLocalClient("late", ORG, fields(), 300));
    await db.clients.put(newLocalClient("early", ORG, fields(), 100));
    await db.clients.put(newLocalClient("middle", ORG, fields(), 200));

    await syncClients(db, ORG, server);
    expect(server.pushCalls[0].map((change) => change.id)).toEqual(["early", "middle", "late"]);
  });

  test("a big queue is split into batches the server accepts", async () => {
    for (let index = 0; index < 250; index += 1) {
      await db.clients.put(newLocalClient(`n${index}`, ORG, fields(), index));
    }
    const outcome = await syncClients(db, ORG, server);
    expect(outcome.pushed).toBe(250);
    expect(server.pushCalls.map((batch) => batch.length)).toEqual([100, 100, 50]);
  });
});
