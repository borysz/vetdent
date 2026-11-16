/**
 * Visits (treatment records) on the device: the generic record rules (see
 * `record-model.ts`) bound to the fields of a visit.
 *
 * Besides the editable fields a visit has a life cycle (`draft` → `final`),
 * which only the server changes; the device learns it by pulling.
 */

import { recordOps, type LocalRow, type RecordSpec, type RecordView, type ServerRecord } from "./record-model";
import { EMPTY_LIST_TEXT } from "./visit-lists";

export const VISIT_STATUSES = ["draft", "final"] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

export const VISIT_FIELDS = [
  "patientId",
  "visitDate",
  "veterinarianName",
  "assistantName",
  "asaStatus",
  "lastFedAt",
  "bloodSummary",
  "weightKg",
  "complaintTags",
  "complaintNotes",
  "homeBrushing",
  "dietType",
  "anesthesiaBlocks",
  "sutures",
  "medications",
  "feedingAdvice",
  "followUpDate",
  "readyToFinalize",
] as const;
export type VisitField = (typeof VISIT_FIELDS)[number];

export interface VisitFields {
  patientId: string;
  /** `YYYY-MM-DD`. */
  visitDate: string;
  veterinarianName: string | null;
  assistantName: string | null;
  /** ASA physical status, 1 to 5. */
  asaStatus: number | null;
  /** Clinic-local time, `YYYY-MM-DDTHH:mm:ss`. */
  lastFedAt: string | null;
  bloodSummary: string | null;
  /** The animal's weight on the day, if it differs from the master data. */
  weightKg: number | null;
  /** Lists are JSON text in canonical form (see `visit-lists.ts`). */
  complaintTags: string;
  complaintNotes: string | null;
  homeBrushing: string | null;
  dietType: string | null;
  anesthesiaBlocks: string;
  sutures: string | null;
  medications: string;
  feedingAdvice: string | null;
  followUpDate: string | null;
  /** Marked on a device that cannot finalise right now (offline or without the right). */
  readyToFinalize: boolean;
}

export const VISIT_WIRE_FIELD: Readonly<Record<VisitField, string>> = {
  patientId: "patient_id",
  visitDate: "visit_date",
  veterinarianName: "veterinarian_name",
  assistantName: "assistant_name",
  asaStatus: "asa_status",
  lastFedAt: "last_fed_at",
  bloodSummary: "blood_summary",
  weightKg: "weight_kg",
  complaintTags: "complaint_tags",
  complaintNotes: "complaint_notes",
  homeBrushing: "home_brushing",
  dietType: "diet_type",
  anesthesiaBlocks: "anesthesia_blocks",
  sutures: "sutures",
  medications: "medications",
  feedingAdvice: "feeding_advice",
  followUpDate: "follow_up_date",
  readyToFinalize: "ready_to_finalize",
};

export const EMPTY_VISIT_FIELDS: VisitFields = {
  patientId: "",
  visitDate: "",
  veterinarianName: null,
  assistantName: null,
  asaStatus: null,
  lastFedAt: null,
  bloodSummary: null,
  weightKg: null,
  complaintTags: EMPTY_LIST_TEXT,
  complaintNotes: null,
  homeBrushing: null,
  dietType: null,
  anesthesiaBlocks: EMPTY_LIST_TEXT,
  sutures: null,
  medications: EMPTY_LIST_TEXT,
  feedingAdvice: null,
  followUpDate: null,
  readyToFinalize: false,
};

export const visitSpec: RecordSpec<VisitFields> = {
  fields: VISIT_FIELDS,
  wire: VISIT_WIRE_FIELD,
  empty: EMPTY_VISIT_FIELDS,
};

/** A visit as the server last told us about it, with its life cycle. */
export type ServerVisit = ServerRecord<VisitFields> & {
  status: VisitStatus;
  finalizedAt: string | null;
};
/** The stored row is the generic one; its `server` copy is a `ServerVisit` (see `statusOf`). */
export type LocalVisitRow = LocalRow<VisitFields>;
export type VisitView = RecordView<VisitFields> & {
  status: VisitStatus;
  finalizedAt: string | null;
};

const baseOps = recordOps(visitSpec);

/** A visit is a draft until the server says otherwise; a visit that exists only here is a draft too. */
export function statusOf(row: LocalRow<VisitFields>): VisitStatus {
  return (row.server as ServerVisit | null)?.status ?? "draft";
}

export const visitOps = {
  ...baseOps,
  viewOf(row: LocalRow<VisitFields>): VisitView {
    const server = row.server as ServerVisit | null;
    return {
      ...baseOps.viewOf(row),
      status: server?.status ?? "draft",
      finalizedAt: server?.finalizedAt ?? null,
    };
  },
};
