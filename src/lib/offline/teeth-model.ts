/**
 * The dental chart of a visit on the device: one synchronised record per tooth
 * (the generic rules of `record-model.ts` bound to its fields).
 */

import { EMPTY_LIST_TEXT } from "@/domain/dental/chart";
import { recordOps, type LocalRow, type RecordSpec, type RecordView, type ServerRecord } from "./record-model";

export const TOOTH_FIELDS = ["visitId", "tooth", "findings", "procedures", "pockets", "note"] as const;
export type ToothField = (typeof TOOTH_FIELDS)[number];

export interface ToothFields {
  visitId: string;
  /** Triadan number, 101–411. */
  tooth: number;
  /** Lists and pocket depths are JSON text in canonical form (see `domain/dental/chart.ts`). */
  findings: string;
  procedures: string;
  pockets: string;
  note: string | null;
}

export const TOOTH_WIRE_FIELD: Readonly<Record<ToothField, string>> = {
  visitId: "visit_id",
  tooth: "tooth",
  findings: "findings",
  procedures: "procedures",
  pockets: "pockets",
  note: "note",
};

export const EMPTY_TOOTH_FIELDS: ToothFields = {
  visitId: "",
  tooth: 0,
  findings: EMPTY_LIST_TEXT,
  procedures: EMPTY_LIST_TEXT,
  pockets: EMPTY_LIST_TEXT,
  note: null,
};

export const toothSpec: RecordSpec<ToothFields> = {
  fields: TOOTH_FIELDS,
  wire: TOOTH_WIRE_FIELD,
  empty: EMPTY_TOOTH_FIELDS,
};

export type ServerTooth = ServerRecord<ToothFields>;
export type LocalToothRow = LocalRow<ToothFields>;
export type ToothView = RecordView<ToothFields>;

export const toothOps = recordOps(toothSpec);
