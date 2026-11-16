/**
 * Pure model of a client (gazdi) as the device stores it: the last state seen
 * from the server, plus the edits that have not been sent yet. No storage, no
 * network – so every rule here can be tested in isolation.
 *
 * What is shown is always "server state + pending edits"; sending an edit
 * never makes the screen jump back.
 */

export const CLIENT_FIELDS = ["fullName", "phone", "email", "address", "notes", "emailConsent"] as const;
export type ClientField = (typeof CLIENT_FIELDS)[number];

export interface ClientFields {
  fullName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  emailConsent: boolean;
}

/** Names of the fields in the sync protocol (see `sync_push_clients` in the database). */
export const WIRE_FIELD: Readonly<Record<ClientField, string>> = {
  fullName: "full_name",
  phone: "phone",
  email: "email",
  address: "address",
  notes: "notes",
  emailConsent: "email_consent",
};

export const EMPTY_CLIENT_FIELDS: ClientFields = {
  fullName: "",
  phone: null,
  email: null,
  address: null,
  notes: null,
  emailConsent: false,
};

/** A record as the server last told us about it. */
export interface ServerClient extends ClientFields {
  id: string;
  rev: number;
  seq: number;
  deletedAt: string | null;
  updatedAt: string;
}

/** Why the server did not accept the device's pending change. */
export type SyncProblem = "invalid" | "forbidden";

export interface LocalClientRow {
  id: string;
  organizationId: string;
  /** `null` while the record exists only on this device. */
  server: ServerClient | null;
  /** Edited fields not yet sent. For a new record: all of its fields. */
  pending: Partial<ClientFields>;
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
  fields: Record<string, string | boolean | null>;
}

export type PushStatus = "applied" | "unchanged" | "invalid" | "forbidden" | "deleted";

export interface PushResult {
  id: string;
  status: PushStatus;
  rev?: number;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface ClientView extends ClientFields {
  id: string;
  /** Not yet known to the server. */
  isNew: boolean;
  /** Has edits (or a delete) waiting to be sent. */
  hasPendingChanges: boolean;
  problem: SyncProblem | null;
}

export function hasPending(row: LocalClientRow): boolean {
  return row.pendingDelete || Object.keys(row.pending).length > 0;
}

/** Deleted on the server, or deleted here and waiting to be sent. */
export function isDeleted(row: LocalClientRow): boolean {
  return row.pendingDelete || row.server?.deletedAt != null;
}

export function viewOf(row: LocalClientRow): ClientView {
  const base: ClientFields = row.server
    ? {
        fullName: row.server.fullName,
        phone: row.server.phone,
        email: row.server.email,
        address: row.server.address,
        notes: row.server.notes,
        emailConsent: row.server.emailConsent,
      }
    : EMPTY_CLIENT_FIELDS;

  return {
    ...base,
    ...row.pending,
    id: row.id,
    isNew: row.server === null,
    hasPendingChanges: hasPending(row),
    problem: row.problem,
  };
}

// ---------------------------------------------------------------------------
// Writing (all of these return a new row; the input is never modified)
// ---------------------------------------------------------------------------

export function newLocalClient(
  id: string,
  organizationId: string,
  fields: ClientFields,
  now: number,
): LocalClientRow {
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

function sameValue(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null);
}

/**
 * Applies an edit. Fields that equal the server's value are dropped from the
 * pending set (nothing to send); editing clears an earlier "refused" mark so
 * the corrected record is sent again.
 */
export function editLocalClient(row: LocalClientRow, patch: Partial<ClientFields>, now: number): LocalClientRow {
  const pending: Partial<ClientFields> = { ...row.pending };

  for (const field of CLIENT_FIELDS) {
    if (!(field in patch)) continue;
    const value = patch[field] as never;
    if (row.server && sameValue(row.server[field], value)) {
      delete pending[field];
    } else {
      (pending as Record<string, unknown>)[field] = value;
    }
  }

  const startedPending = Object.keys(row.pending).length === 0;
  return {
    ...row,
    pending,
    // The base is where the *first* pending edit started; later edits keep it.
    pendingBaseRev: Object.keys(pending).length === 0 ? null : startedPending ? (row.server?.rev ?? null) : row.pendingBaseRev,
    problem: null,
    touchedAt: now,
  };
}

/**
 * Deletes a record. One that never reached the server simply disappears
 * (`null`); otherwise the delete is queued.
 */
export function deleteLocalClient(row: LocalClientRow, now: number): LocalClientRow | null {
  if (row.server === null) return null;
  return { ...row, pending: {}, pendingBaseRev: null, pendingDelete: true, problem: null, touchedAt: now };
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export function wireFields(fields: Partial<ClientFields>): Record<string, string | boolean | null> {
  const wire: Record<string, string | boolean | null> = {};
  for (const field of CLIENT_FIELDS) {
    if (field in fields) wire[WIRE_FIELD[field]] = fields[field] as string | boolean | null;
  }
  return wire;
}

/** The change to send for this row, or `null` if there is nothing (or it was refused and not yet corrected). */
export function pendingChange(row: LocalClientRow): WireChange | null {
  if (row.problem) return null;

  if (row.pendingDelete) {
    return { id: row.id, op: "delete", base_rev: row.server?.rev ?? null, fields: {} };
  }
  if (Object.keys(row.pending).length === 0) return null;

  return { id: row.id, op: "upsert", base_rev: row.pendingBaseRev, fields: wireFields(row.pending) };
}

/** Folds the server's answer into the row. Returns `null` when the row should be dropped. */
export function applyPushResult(row: LocalClientRow, result: PushResult, now: number): LocalClientRow | null {
  switch (result.status) {
    case "applied":
    case "unchanged": {
      const rev = result.rev ?? row.server?.rev ?? 1;

      if (row.pendingDelete) {
        const server = row.server;
        return server ? { ...row, server: { ...server, deletedAt: new Date(now).toISOString(), rev }, pending: {}, pendingDelete: false, pendingBaseRev: null } : null;
      }

      // Keep showing what the user entered; the next pull replaces it with the server's copy.
      const merged: ServerClient = {
        id: row.id,
        seq: row.server?.seq ?? 0,
        deletedAt: row.server?.deletedAt ?? null,
        updatedAt: new Date(now).toISOString(),
        ...(row.server ?? EMPTY_CLIENT_FIELDS),
        ...row.pending,
        rev,
      };
      return { ...row, server: merged, pending: {}, pendingBaseRev: null, problem: null };
    }

    case "invalid":
    case "forbidden":
      return { ...row, problem: result.status };

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
export function applyPulled(row: LocalClientRow | undefined, incoming: ServerClient, organizationId: string): LocalClientRow {
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
  const pending: Partial<ClientFields> = { ...row.pending };
  for (const field of CLIENT_FIELDS) {
    if (field in pending && sameValue(pending[field], incoming[field])) delete pending[field];
  }

  return { ...row, server: incoming, pending, pendingBaseRev: Object.keys(pending).length === 0 ? null : row.pendingBaseRev };
}
