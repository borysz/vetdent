/**
 * Pure model of a synchronised record as the device stores it: the last state
 * seen from the server, plus the edits that have not been sent yet. No
 * storage, no network – so every rule can be tested in isolation, and every
 * kind of record (clients, patients, …) follows exactly the same rules.
 *
 * What is shown is always "server state + pending edits"; sending an edit
 * never makes the screen jump back.
 */

/** Describes one kind of record: its editable fields and their names in the sync protocol. */
export interface RecordSpec<F extends object> {
  readonly fields: readonly (keyof F & string)[];
  /** Field name in the database / sync protocol (snake_case). */
  readonly wire: Readonly<Record<keyof F & string, string>>;
  /** Values of a record that has nothing filled in yet. */
  readonly empty: F;
}

/** A record as the server last told us about it. */
export type ServerRecord<F extends object> = F & {
  id: string;
  rev: number;
  seq: number;
  deletedAt: string | null;
  updatedAt: string;
};

/** Why the server did not accept the device's pending change. */
export type SyncProblem = "invalid" | "forbidden";

export interface LocalRow<F extends object> {
  id: string;
  organizationId: string;
  /** `null` while the record exists only on this device. */
  server: ServerRecord<F> | null;
  /** Edited fields not yet sent. For a new record: all of its fields. */
  pending: Partial<F>;
  /** Revision the pending edits started from; `null` for a new record. */
  pendingBaseRev: number | null;
  pendingDelete: boolean;
  /** Set when the server refused the pending change; it is not resent until edited. */
  problem: SyncProblem | null;
  /** When the user last touched it on this device (ms since epoch). */
  touchedAt: number;
}

export interface WireChange {
  id: string;
  op: "upsert" | "delete";
  base_rev: number | null;
  fields: Record<string, string | number | boolean | null>;
}

/**
 * `locked`: the record was finalised elsewhere. The edit was not applied, but
 * the server kept it (in `sync_conflicts`), so the device drops its pending
 * copy and takes the server's version at the next pull.
 */
export type PushStatus = "applied" | "unchanged" | "invalid" | "forbidden" | "deleted" | "locked";

export interface PushResult {
  id: string;
  status: PushStatus;
  rev?: number;
}

export type RecordView<F extends object> = F & {
  id: string;
  /** Not yet known to the server. */
  isNew: boolean;
  /** Has edits (or a delete) waiting to be sent. */
  hasPendingChanges: boolean;
  problem: SyncProblem | null;
};

// ---------------------------------------------------------------------------
// Rules that do not depend on the kind of record
// ---------------------------------------------------------------------------

export function hasPending<F extends object>(row: LocalRow<F>): boolean {
  return row.pendingDelete || Object.keys(row.pending).length > 0;
}

/** Deleted on the server, or deleted here and waiting to be sent. */
export function isDeleted<F extends object>(row: LocalRow<F>): boolean {
  return row.pendingDelete || row.server?.deletedAt != null;
}

function sameValue(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null);
}

// ---------------------------------------------------------------------------
// Rules for one kind of record
// ---------------------------------------------------------------------------

export function recordOps<F extends object>(spec: RecordSpec<F>) {
  type Row = LocalRow<F>;

  function pickFields(source: F): F {
    const picked = {} as F;
    for (const field of spec.fields) picked[field] = source[field];
    return picked;
  }

  function viewOf(row: Row): RecordView<F> {
    const base = row.server ? pickFields(row.server) : spec.empty;
    return {
      ...base,
      ...row.pending,
      id: row.id,
      isNew: row.server === null,
      hasPendingChanges: hasPending(row),
      problem: row.problem,
    };
  }

  function newLocal(id: string, organizationId: string, fields: F, now: number): Row {
    return {
      id,
      organizationId,
      server: null,
      pending: { ...fields },
      pendingBaseRev: null,
      pendingDelete: false,
      problem: null,
      touchedAt: now,
    };
  }

  /**
   * Applies an edit. Fields that equal the server's value are dropped from the
   * pending set (nothing to send); editing clears an earlier "refused" mark so
   * the corrected record is sent again.
   */
  function editLocal(row: Row, patch: Partial<F>, now: number): Row {
    const pending: Partial<F> = { ...row.pending };

    for (const field of spec.fields) {
      if (!(field in patch)) continue;
      const value = patch[field] as F[typeof field];
      if (row.server && sameValue(row.server[field], value)) {
        delete pending[field];
      } else {
        pending[field] = value;
      }
    }

    const startedPending = Object.keys(row.pending).length === 0;
    const nothingPending = Object.keys(pending).length === 0;
    return {
      ...row,
      pending,
      // The base is where the *first* pending edit started; later edits keep it.
      pendingBaseRev: nothingPending ? null : startedPending ? (row.server?.rev ?? null) : row.pendingBaseRev,
      problem: null,
      touchedAt: now,
    };
  }

  /** A record that never reached the server simply disappears (`null`); otherwise the delete is queued. */
  function deleteLocal(row: Row, now: number): Row | null {
    if (row.server === null) return null;
    return { ...row, pending: {}, pendingBaseRev: null, pendingDelete: true, problem: null, touchedAt: now };
  }

  function wireFields(fields: Partial<F>): WireChange["fields"] {
    const wire: WireChange["fields"] = {};
    for (const field of spec.fields) {
      if (field in fields) wire[spec.wire[field]] = fields[field] as WireChange["fields"][string];
    }
    return wire;
  }

  /** The change to send for this row, or `null` if there is nothing (or it was refused and not yet corrected). */
  function pendingChange(row: Row): WireChange | null {
    if (row.problem) return null;

    if (row.pendingDelete) {
      return { id: row.id, op: "delete", base_rev: row.server?.rev ?? null, fields: {} };
    }
    if (Object.keys(row.pending).length === 0) return null;

    return { id: row.id, op: "upsert", base_rev: row.pendingBaseRev, fields: wireFields(row.pending) };
  }

  /** Folds the server's answer into the row. Returns `null` when the row should be dropped. */
  function applyPushResult(row: Row, result: PushResult, now: number): Row | null {
    switch (result.status) {
      case "applied":
      case "unchanged": {
        const rev = result.rev ?? row.server?.rev ?? 1;

        if (row.pendingDelete) {
          const server = row.server;
          return server
            ? {
                ...row,
                server: { ...server, deletedAt: new Date(now).toISOString(), rev },
                pending: {},
                pendingDelete: false,
                pendingBaseRev: null,
              }
            : null;
        }

        // Keep showing what the user entered; the next pull replaces it with the server's copy.
        // Whatever else the server told us about the record (for example its status) is kept.
        const merged = {
          ...(row.server ?? spec.empty),
          id: row.id,
          seq: row.server?.seq ?? 0,
          deletedAt: row.server?.deletedAt ?? null,
          updatedAt: new Date(now).toISOString(),
          ...row.pending,
          rev,
        } as ServerRecord<F>;
        return { ...row, server: merged, pending: {}, pendingBaseRev: null, problem: null };
      }

      case "invalid":
      case "forbidden":
        return { ...row, problem: result.status };

      case "locked":
        // A record that never reached the server cannot be kept; one that did keeps its server copy.
        return row.server ? { ...row, pending: {}, pendingBaseRev: null, pendingDelete: false, problem: null } : null;

      case "deleted": {
        // Someone deleted it before our edit arrived: the delete stands, our edit is dropped.
        const server = row.server;
        if (!server) return null;
        return {
          ...row,
          server: { ...server, deletedAt: server.deletedAt ?? new Date(now).toISOString() },
          pending: {},
          pendingBaseRev: null,
          pendingDelete: false,
          problem: null,
        };
      }
    }
  }

  /**
   * Folds a record received from the server into the row. Older or repeated
   * copies are ignored, so pulling is safe to repeat. Pending edits stay: they
   * are re-sent on top of the newer copy.
   */
  function applyPulled(row: Row | undefined, incoming: ServerRecord<F>, organizationId: string): Row {
    if (!row) {
      return {
        id: incoming.id,
        organizationId,
        server: incoming,
        pending: {},
        pendingBaseRev: null,
        pendingDelete: false,
        problem: null,
        touchedAt: 0,
      };
    }
    if (row.server && row.server.rev >= incoming.rev) return row;

    // A record deleted elsewhere takes its pending edits with it.
    if (incoming.deletedAt) {
      return { ...row, server: incoming, pending: {}, pendingBaseRev: null, pendingDelete: false, problem: null };
    }

    // Edits made on this device that now equal the server's value are no longer pending.
    const pending: Partial<F> = { ...row.pending };
    for (const field of spec.fields) {
      if (field in pending && sameValue(pending[field], incoming[field])) delete pending[field];
    }

    return {
      ...row,
      server: incoming,
      pending,
      pendingBaseRev: Object.keys(pending).length === 0 ? null : row.pendingBaseRev,
    };
  }

  /**
   * The user may edit a record while it is being sent. Only what was actually
   * sent is acknowledged; later edits stay pending, on top of the server's answer.
   */
  function reconcileAfterPush(sent: Row, current: Row, result: PushResult, now: number): Row | null {
    const acknowledged = applyPushResult(sent, result, now);
    if (acknowledged === null) return null;

    // Refused: the answer applies to the row as it is now.
    if (result.status === "invalid" || result.status === "forbidden") {
      return applyPushResult(current, result, now);
    }

    if (current.pendingDelete && !sent.pendingDelete) {
      return deleteLocal(acknowledged, current.touchedAt);
    }

    const later: Partial<F> = {};
    for (const field of spec.fields) {
      if (!(field in current.pending)) continue;
      const wasSent = field in sent.pending && sameValue(sent.pending[field], current.pending[field]);
      if (!wasSent) later[field] = current.pending[field] as F[typeof field];
    }
    return Object.keys(later).length > 0 ? editLocal(acknowledged, later, current.touchedAt) : acknowledged;
  }

  return {
    spec,
    viewOf,
    newLocal,
    editLocal,
    deleteLocal,
    wireFields,
    pendingChange,
    applyPushResult,
    applyPulled,
    reconcileAfterPush,
  };
}

export type RecordOps<F extends object> = ReturnType<typeof recordOps<F>>;
