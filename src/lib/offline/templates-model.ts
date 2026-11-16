/**
 * Templates on the device: the generic record rules (see `record-model.ts`)
 * bound to the fields of a template. Which templates arrive on the device is
 * decided by the database: organization-wide ones and the user's own.
 */

import { recordOps, type LocalRow, type RecordSpec, type RecordView, type ServerRecord } from "./record-model";

export const TEMPLATE_KINDS = ["treatment", "text"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_FIELDS = ["kind", "name", "shared", "species", "textTarget", "body", "payload"] as const;
export type TemplateField = (typeof TEMPLATE_FIELDS)[number];

export interface TemplateFields {
  kind: TemplateKind;
  name: string;
  /** Seen by every member of the organization (otherwise only by its owner). */
  shared: boolean;
  /** `null`: for both species. */
  species: "dog" | "cat" | null;
  /** A text template: the field of the visit it is meant for (as named in the database); `null`: any text field. */
  textTarget: string | null;
  /** A text template's text. */
  body: string | null;
  /** A treatment template's content, as canonical JSON text (see `domain/dental/template.ts`). */
  payload: string | null;
}

export const TEMPLATE_WIRE_FIELD: Readonly<Record<TemplateField, string>> = {
  kind: "kind",
  name: "name",
  shared: "shared",
  species: "species",
  textTarget: "text_target",
  body: "body",
  payload: "payload",
};

export const EMPTY_TEMPLATE_FIELDS: TemplateFields = {
  kind: "text",
  name: "",
  shared: false,
  species: null,
  textTarget: null,
  body: null,
  payload: null,
};

export const templateSpec: RecordSpec<TemplateFields> = {
  fields: TEMPLATE_FIELDS,
  wire: TEMPLATE_WIRE_FIELD,
  empty: EMPTY_TEMPLATE_FIELDS,
};

export type ServerTemplate = ServerRecord<TemplateFields>;
export type LocalTemplateRow = LocalRow<TemplateFields>;
export type TemplateView = RecordView<TemplateFields>;

export const templateOps = recordOps(templateSpec);
