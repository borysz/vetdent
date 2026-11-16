/**
 * Clients (gazdik) on the device: the generic record rules (see
 * `record-model.ts`) bound to the fields of a client.
 */

import {
  hasPending,
  isDeleted,
  recordOps,
  type LocalRow,
  type PushResult,
  type PushStatus,
  type RecordSpec,
  type RecordView,
  type ServerRecord,
  type SyncProblem,
  type WireChange,
} from "./record-model";

export { hasPending, isDeleted };
export type { PushResult, PushStatus, SyncProblem, WireChange };

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

export const clientSpec: RecordSpec<ClientFields> = {
  fields: CLIENT_FIELDS,
  wire: WIRE_FIELD,
  empty: EMPTY_CLIENT_FIELDS,
};

export type ServerClient = ServerRecord<ClientFields>;
export type LocalClientRow = LocalRow<ClientFields>;
export type ClientView = RecordView<ClientFields>;

export const clientOps = recordOps(clientSpec);

export const viewOf = clientOps.viewOf;
export const newLocalClient = clientOps.newLocal;
export const editLocalClient = clientOps.editLocal;
export const deleteLocalClient = clientOps.deleteLocal;
export const wireFields = clientOps.wireFields;
export const pendingChange = clientOps.pendingChange;
export const applyPushResult = clientOps.applyPushResult;
export const applyPulled = clientOps.applyPulled;
