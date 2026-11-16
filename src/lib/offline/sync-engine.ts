import type { Table } from "dexie";
import { clientOps, type ClientFields } from "./clients-model";
import { META_KEYS, readMeta, writeMeta, type LocalDatabase } from "./local-db";
import { patientOps, type PatientFields } from "./patients-model";
import {
  hasPending,
  type LocalRow,
  type PushResult,
  type RecordOps,
  type ServerRecord,
  type WireChange,
} from "./record-model";

/** Why a synchronisation round could not finish. */
export type SyncErrorKind = "offline" | "read_only" | "forbidden" | "unauthenticated" | "mfa_required" | "unknown";

export class SyncError extends Error {
  constructor(
    readonly kind: SyncErrorKind,
    message?: string,
  ) {
    super(message ?? kind);
    this.name = "SyncError";
  }
}

/** What the engine needs from the network. Implemented for Supabase; faked in tests. */
export interface SyncApi {
  pushClients(changes: WireChange[]): Promise<PushResult[]>;
  /** Records with a `seq` greater than `afterSeq`, in `seq` order. */
  pullClients(afterSeq: number, limit: number): Promise<ServerRecord<ClientFields>[]>;
  pushPatients(changes: WireChange[]): Promise<PushResult[]>;
  pullPatients(afterSeq: number, limit: number): Promise<ServerRecord<PatientFields>[]>;
}

export interface SyncOutcome {
  pushed: number;
  pulled: number;
  /** Changes the server refused (they stay on the device for the user to fix). */
  refused: number;
  error: SyncError | null;
}

/** One kind of synchronised record: where it is stored, how it behaves, and how to reach the server. */
interface SyncTable<F extends object> {
  table(db: LocalDatabase): Table<LocalRow<F>, string>;
  ops: RecordOps<F>;
  cursorKey: string;
  push(api: SyncApi, changes: WireChange[]): Promise<PushResult[]>;
  pull(api: SyncApi, afterSeq: number, limit: number): Promise<ServerRecord<F>[]>;
  /**
   * Decides, per round, which pending rows may be sent now. A row that has to
   * wait is left exactly as it is – no error, nothing lost – and goes out in a
   * later round.
   */
  readyToSend?(db: LocalDatabase): Promise<(row: LocalRow<F>) => boolean>;
}

const clientsTable: SyncTable<ClientFields> = {
  table: (db) => db.clients,
  ops: clientOps,
  cursorKey: META_KEYS.clientsCursor,
  push: (api, changes) => api.pushClients(changes),
  pull: (api, afterSeq, limit) => api.pullClients(afterSeq, limit),
};

const patientsTable: SyncTable<PatientFields> = {
  table: (db) => db.patients,
  ops: patientOps,
  cursorKey: META_KEYS.patientsCursor,
  push: (api, changes) => api.pushPatients(changes),
  pull: (api, afterSeq, limit) => api.pullPatients(afterSeq, limit),
  // A patient waits while its owner is still unknown to the server (for
  // instance because the owner was refused and has not been corrected yet);
  // sending it now would only get it refused as well.
  async readyToSend(db) {
    const owners = await db.clients.toArray();
    const unknownToServer = new Set(owners.filter((owner) => owner.server === null).map((owner) => owner.id));
    return (row) => {
      const ownerId = row.pending.clientId ?? row.server?.clientId;
      return ownerId === undefined || !unknownToServer.has(ownerId);
    };
  },
};

const PUSH_BATCH = 100;
const PULL_PAGE = 500;
/**
 * Pulling starts a little before the cursor. Changes that were committed out
 * of order (two writes finishing in a different order than they started)
 * could otherwise be skipped; repeats are harmless because older copies are ignored.
 */
const PULL_OVERLAP = 100;

async function pushAll<F extends object>(
  db: LocalDatabase,
  kind: SyncTable<F>,
  api: SyncApi,
): Promise<{ pushed: number; refused: number }> {
  const store = kind.table(db);
  const ready = kind.readyToSend ? await kind.readyToSend(db) : () => true;
  const rows = await store.toArray();
  const queue = rows
    .filter(ready)
    .map((row) => ({ row, change: kind.ops.pendingChange(row) }))
    .filter((entry): entry is { row: LocalRow<F>; change: WireChange } => entry.change !== null)
    // Oldest edits first, so the server sees them in the order they were made.
    .sort((a, b) => a.row.touchedAt - b.row.touchedAt);

  let pushed = 0;
  let refused = 0;

  for (let start = 0; start < queue.length; start += PUSH_BATCH) {
    const batch = queue.slice(start, start + PUSH_BATCH);
    const results = await kind.push(
      api,
      batch.map((entry) => entry.change),
    );
    const byId = new Map(results.map((result) => [result.id, result]));

    await db.transaction("rw", store, async () => {
      for (const { row: sent } of batch) {
        const result = byId.get(sent.id);
        if (!result) continue;

        const current = (await store.get(sent.id)) ?? sent;
        const next = kind.ops.reconcileAfterPush(sent, current, result, Date.now());

        if (next === null) await store.delete(sent.id);
        else await store.put(next);

        if (result.status === "invalid" || result.status === "forbidden") refused += 1;
        else pushed += 1;
      }
    });
  }

  return { pushed, refused };
}

async function pullAll<F extends object>(
  db: LocalDatabase,
  kind: SyncTable<F>,
  organizationId: string,
  api: SyncApi,
): Promise<number> {
  const store = kind.table(db);
  const stored = await readMeta(db, kind.cursorKey);
  let cursor = typeof stored === "number" ? stored : 0;
  let pulled = 0;

  for (;;) {
    const page = await kind.pull(api, Math.max(0, cursor - PULL_OVERLAP), PULL_PAGE);

    await db.transaction("rw", store, async () => {
      for (const incoming of page) {
        const existing = await store.get(incoming.id);
        const next = kind.ops.applyPulled(existing, incoming, organizationId);
        if (next !== existing) {
          await store.put(next);
          pulled += 1;
        }
      }
    });

    const newest = page.reduce((max, record) => Math.max(max, record.seq), cursor);
    const advanced = newest > cursor;
    cursor = newest;
    await writeMeta(db, kind.cursorKey, cursor);

    // A short page is the end; so is a page that moved nothing forward.
    if (page.length < PULL_PAGE || !advanced) break;
  }

  return pulled;
}

async function syncKind<F extends object>(
  db: LocalDatabase,
  kind: SyncTable<F>,
  organizationId: string,
  api: SyncApi,
): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { pushed: 0, pulled: 0, refused: 0, error: null };

  try {
    const sent = await pushAll(db, kind, api);
    outcome.pushed = sent.pushed;
    outcome.refused = sent.refused;
    outcome.pulled = await pullAll(db, kind, organizationId, api);
    await writeMeta(db, META_KEYS.lastSyncAt, Date.now());
  } catch (error) {
    outcome.error = error instanceof SyncError ? error : new SyncError("unknown", String(error));
  }

  return outcome;
}

/**
 * One round of synchronisation for clients: send what was changed on this
 * device, then fetch what changed elsewhere. Safe to call at any time and as
 * often as you like; when the network is down it fails quietly and everything
 * stays queued.
 */
export function syncClients(db: LocalDatabase, organizationId: string, api: SyncApi): Promise<SyncOutcome> {
  return syncKind(db, clientsTable, organizationId, api);
}

export function syncPatients(db: LocalDatabase, organizationId: string, api: SyncApi): Promise<SyncOutcome> {
  return syncKind(db, patientsTable, organizationId, api);
}

/**
 * Everything, in dependency order: clients first, because a patient refers to
 * its owner and the server refuses a patient whose owner it does not know yet.
 */
export async function syncAll(db: LocalDatabase, organizationId: string, api: SyncApi): Promise<SyncOutcome> {
  const clients = await syncClients(db, organizationId, api);
  if (clients.error) return clients;

  const patients = await syncPatients(db, organizationId, api);
  return {
    pushed: clients.pushed + patients.pushed,
    pulled: clients.pulled + patients.pulled,
    refused: clients.refused + patients.refused,
    error: patients.error,
  };
}

export interface SyncCounts {
  /** Records with changes waiting to be sent. */
  pending: number;
  /** Records the server refused and the user has to correct. */
  problems: number;
}

export async function countPending(db: LocalDatabase): Promise<SyncCounts> {
  const rows: { problem: string | null; pendingDelete: boolean; pending: object }[] = [
    ...(await db.clients.toArray()),
    ...(await db.patients.toArray()),
  ];
  return {
    pending: rows.filter((row) => hasPending(row as LocalRow<object>) && !row.problem).length,
    problems: rows.filter((row) => row.problem !== null).length,
  };
}
