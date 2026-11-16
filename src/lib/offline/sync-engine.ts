import {
  applyPulled,
  applyPushResult,
  deleteLocalClient,
  editLocalClient,
  hasPending,
  pendingChange,
  CLIENT_FIELDS,
  type ClientFields,
  type LocalClientRow,
  type PushResult,
  type ServerClient,
  type WireChange,
} from "./clients-model";
import { META_KEYS, readMeta, writeMeta, type LocalDatabase } from "./local-db";

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
  pullClients(afterSeq: number, limit: number): Promise<ServerClient[]>;
}

export interface SyncOutcome {
  pushed: number;
  pulled: number;
  /** Changes the server refused (they stay on the device for the user to fix). */
  refused: number;
  error: SyncError | null;
}

const PUSH_BATCH = 100;
const PULL_PAGE = 500;
/**
 * Pulling starts a little before the cursor. Changes that were committed out
 * of order (two writes finishing in a different order than they started)
 * could otherwise be skipped; repeats are harmless because older copies are ignored.
 */
const PULL_OVERLAP = 100;

function sameFieldValue(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null);
}

/**
 * The user may edit a record while it is being sent. Only what was actually
 * sent is acknowledged; later edits stay pending, on top of the server's answer.
 */
function reconcileAfterPush(
  sent: LocalClientRow,
  current: LocalClientRow,
  result: PushResult,
  now: number,
): LocalClientRow | null {
  const acknowledged = applyPushResult(sent, result, now);
  if (acknowledged === null) return null;

  // Refused or already deleted: the answer applies to the row as it is now.
  if (result.status === "invalid" || result.status === "forbidden") {
    return applyPushResult(current, result, now);
  }

  let merged: LocalClientRow | null = acknowledged;

  if (current.pendingDelete && !sent.pendingDelete) {
    return deleteLocalClient(merged, current.touchedAt);
  }

  const later: Partial<ClientFields> = {};
  for (const field of CLIENT_FIELDS) {
    if (!(field in current.pending)) continue;
    const wasSent = field in sent.pending && sameFieldValue(sent.pending[field], current.pending[field]);
    if (!wasSent) (later as Record<string, unknown>)[field] = current.pending[field];
  }
  if (Object.keys(later).length > 0) {
    merged = editLocalClient(merged, later, current.touchedAt);
  }
  return merged;
}

async function pushAll(db: LocalDatabase, api: SyncApi): Promise<{ pushed: number; refused: number }> {
  const rows = await db.clients.toArray();
  const queue = rows
    .map((row) => ({ row, change: pendingChange(row) }))
    .filter((entry): entry is { row: LocalClientRow; change: WireChange } => entry.change !== null)
    // Oldest edits first, so the server sees them in the order they were made.
    .sort((a, b) => a.row.touchedAt - b.row.touchedAt);

  let pushed = 0;
  let refused = 0;

  for (let start = 0; start < queue.length; start += PUSH_BATCH) {
    const batch = queue.slice(start, start + PUSH_BATCH);
    const results = await api.pushClients(batch.map((entry) => entry.change));
    const byId = new Map(results.map((result) => [result.id, result]));

    await db.transaction("rw", db.clients, async () => {
      for (const { row: sent } of batch) {
        const result = byId.get(sent.id);
        if (!result) continue;

        const current = (await db.clients.get(sent.id)) ?? sent;
        const next = reconcileAfterPush(sent, current, result, Date.now());

        if (next === null) await db.clients.delete(sent.id);
        else await db.clients.put(next);

        if (result.status === "invalid" || result.status === "forbidden") refused += 1;
        else pushed += 1;
      }
    });
  }

  return { pushed, refused };
}

async function pullAll(db: LocalDatabase, organizationId: string, api: SyncApi): Promise<number> {
  const stored = await readMeta(db, META_KEYS.clientsCursor);
  let cursor = typeof stored === "number" ? stored : 0;
  let pulled = 0;

  for (;;) {
    const page = await api.pullClients(Math.max(0, cursor - PULL_OVERLAP), PULL_PAGE);

    await db.transaction("rw", db.clients, async () => {
      for (const incoming of page) {
        const existing = await db.clients.get(incoming.id);
        const next = applyPulled(existing, incoming, organizationId);
        if (next !== existing) {
          await db.clients.put(next);
          pulled += 1;
        }
      }
    });

    const newest = page.reduce((max, record) => Math.max(max, record.seq), cursor);
    const advanced = newest > cursor;
    cursor = newest;
    await writeMeta(db, META_KEYS.clientsCursor, cursor);

    // A short page is the end; so is a page that moved nothing forward.
    if (page.length < PULL_PAGE || !advanced) break;
  }

  return pulled;
}

/**
 * One round of synchronisation: send what was changed on this device, then
 * fetch what changed elsewhere. Safe to call at any time and as often as you
 * like; when the network is down it fails quietly and everything stays queued.
 */
export async function syncClients(db: LocalDatabase, organizationId: string, api: SyncApi): Promise<SyncOutcome> {
  const outcome: SyncOutcome = { pushed: 0, pulled: 0, refused: 0, error: null };

  try {
    const sent = await pushAll(db, api);
    outcome.pushed = sent.pushed;
    outcome.refused = sent.refused;
    outcome.pulled = await pullAll(db, organizationId, api);
    await writeMeta(db, META_KEYS.lastSyncAt, Date.now());
  } catch (error) {
    outcome.error = error instanceof SyncError ? error : new SyncError("unknown", String(error));
  }

  return outcome;
}

export interface SyncCounts {
  /** Records with changes waiting to be sent. */
  pending: number;
  /** Records the server refused and the user has to correct. */
  problems: number;
}

export async function countPending(db: LocalDatabase): Promise<SyncCounts> {
  const rows = await db.clients.toArray();
  return {
    pending: rows.filter((row) => hasPending(row) && !row.problem).length,
    problems: rows.filter((row) => row.problem !== null).length,
  };
}
