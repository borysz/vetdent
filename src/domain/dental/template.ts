/**
 * Treatment templates (PROJEKT_PROMPT 8.8) without any screen or storage: what
 * a template contains, how one is made from a visit, and what loading one onto
 * an animal does.
 *
 * A template has tooth entries. An entry with a tooth number is fixed ("the
 * upper right canine is extracted"); an entry without one is meant for the
 * teeth the user chooses when loading ("tartar removal and polishing on these").
 */

import { getTooth, type Species } from "@/domain/teeth/catalog";
import {
  EMPTY_MARKS,
  canApply,
  parseFindings,
  parseProcedures,
  serializeFindings,
  serializeProcedures,
  withFinding,
  withProcedure,
  type RefusalReason,
  type ToothMarks,
} from "./chart";
import { parseMedications, type Medication } from "@/lib/offline/visit-lists";

/** The fields of the visit a text can be put into, as named in the stored template. */
export const TEXT_KEYS = ["feeding_advice", "sutures", "complaint_notes", "general_note"] as const;
export type TextKey = (typeof TEXT_KEYS)[number];

export interface TemplateTooth {
  /** `null`: applies to the teeth chosen when the template is loaded. */
  tooth: number | null;
  marks: ToothMarks;
}

export interface TemplatePayload {
  teeth: TemplateTooth[];
  texts: Partial<Record<TextKey, string>>;
  medications: Medication[];
}

export const EMPTY_PAYLOAD: TemplatePayload = { teeth: [], texts: {}, medications: [] };

// ---------------------------------------------------------------------------
// Stored form
// ---------------------------------------------------------------------------

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Whatever is valid in the stored text; entries without any mark are dropped. */
export function parsePayload(value: unknown): TemplatePayload {
  const source = asObject(value);

  const teeth: TemplateTooth[] = [];
  if (Array.isArray(source.teeth)) {
    for (const entry of source.teeth) {
      if (entry === null || typeof entry !== "object") continue;
      const { tooth, findings, procedures } = entry as Record<string, unknown>;
      const marks: ToothMarks = { findings: parseFindings(findings), procedures: parseProcedures(procedures) };
      if (marks.findings.length === 0 && marks.procedures.length === 0) continue;
      teeth.push({ tooth: typeof tooth === "number" && Number.isInteger(tooth) ? tooth : null, marks });
    }
  }

  const texts: Partial<Record<TextKey, string>> = {};
  const rawTexts = asObject(source.texts);
  for (const key of TEXT_KEYS) {
    const text = rawTexts[key];
    if (typeof text === "string" && text.trim().length > 0) texts[key] = text.trim().slice(0, 2000);
  }

  return { teeth, texts, medications: parseMedications(source.medications) };
}

/** Canonical text: the same content always gives the same text. */
export function serializePayload(payload: TemplatePayload): string {
  const teeth = payload.teeth
    .map((entry) => ({
      tooth: entry.tooth,
      findings: parseFindings(entry.marks.findings),
      procedures: parseProcedures(entry.marks.procedures),
    }))
    .filter((entry) => entry.findings.length > 0 || entry.procedures.length > 0);

  const texts: Record<string, string> = {};
  for (const key of TEXT_KEYS) {
    const text = payload.texts[key]?.trim();
    if (text) texts[key] = text.slice(0, 2000);
  }

  return JSON.stringify({ teeth, texts, medications: parseMedications(payload.medications) });
}

// ---------------------------------------------------------------------------
// Making a template from a visit
// ---------------------------------------------------------------------------

/** Teeth that carry exactly the same marks. */
export interface MarkGroup {
  key: string;
  marks: ToothMarks;
  teeth: number[];
}

/**
 * The charted teeth, grouped by identical marks ("12 teeth with T2, U, POL").
 * When a template is saved each group is either kept as it is (fixed teeth) or
 * made applicable to teeth chosen on loading.
 */
export function groupMarks(chart: ReadonlyMap<number, ToothMarks>): MarkGroup[] {
  const groups = new Map<string, MarkGroup>();
  for (const [tooth, marks] of [...chart].sort((a, b) => a[0] - b[0])) {
    if (marks.findings.length === 0 && marks.procedures.length === 0) continue;
    const key = `${serializeFindings(marks.findings)}|${serializeProcedures(marks.procedures)}`;
    const group = groups.get(key) ?? { key, marks, teeth: [] };
    group.teeth.push(tooth);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function payloadFromVisit(options: {
  groups: readonly MarkGroup[];
  /** Keys of the groups that apply to teeth chosen on loading; the others stay on their teeth. */
  selectable: ReadonlySet<string>;
  texts: Partial<Record<TextKey, string>>;
  medications: readonly Medication[];
}): TemplatePayload {
  const teeth: TemplateTooth[] = [];
  for (const group of options.groups) {
    if (options.selectable.has(group.key)) teeth.push({ tooth: null, marks: group.marks });
    else for (const tooth of group.teeth) teeth.push({ tooth, marks: group.marks });
  }
  return parsePayload({
    teeth: teeth.map((entry) => ({ tooth: entry.tooth, findings: entry.marks.findings, procedures: entry.marks.procedures })),
    texts: options.texts,
    medications: options.medications,
  });
}

// ---------------------------------------------------------------------------
// Loading a template onto an animal
// ---------------------------------------------------------------------------

/**
 * Puts marks on one tooth the way the quick-entry panel does: each mark goes
 * through the same rules, and one that does not fit (a resorptive lesion on a
 * dog, anything on a missing tooth) is skipped and counted.
 */
export function applyMarksTo(species: Species, tooth: number, current: ToothMarks, marks: ToothMarks): { next: ToothMarks; skipped: RefusalReason[] } {
  const definition = getTooth(species, tooth);
  if (!definition) return { next: current, skipped: ["invalid"] };

  let next = current;
  const skipped: RefusalReason[] = [];
  for (const finding of marks.findings) {
    const verdict = canApply(species, definition, next, finding.code, finding.level);
    if (verdict.ok) next = withFinding(next, finding.code, finding.level);
    else skipped.push(verdict.reason);
  }
  for (const procedure of marks.procedures) {
    const verdict = canApply(species, definition, next, procedure.code, procedure.level);
    if (verdict.ok) next = withProcedure(next, procedure.code, procedure.level, procedure.state);
    else skipped.push(verdict.reason);
  }
  return { next, skipped };
}

export interface TemplateOutcome {
  /** The teeth whose marks change, with the marks they will have. */
  changes: Map<number, ToothMarks>;
  /** The marks that did not fit, by reason. */
  skipped: Partial<Record<RefusalReason, number>>;
  /** The template has entries for chosen teeth, but no tooth is selected. */
  needsSelection: boolean;
}

export function applyTemplate(
  payload: TemplatePayload,
  species: Species,
  selected: readonly number[],
  marksOf: (tooth: number) => ToothMarks,
): TemplateOutcome {
  const changes = new Map<number, ToothMarks>();
  const skipped: Partial<Record<RefusalReason, number>> = {};
  const selectable = payload.teeth.filter((entry) => entry.tooth === null);
  const needsSelection = selectable.length > 0 && selected.length === 0;

  const put = (tooth: number, marks: ToothMarks) => {
    const current = changes.get(tooth) ?? marksOf(tooth);
    const { next, skipped: refused } = applyMarksTo(species, tooth, current, marks);
    for (const reason of refused) skipped[reason] = (skipped[reason] ?? 0) + 1;
    if (next !== current || changes.has(tooth)) changes.set(tooth, next);
  };

  for (const entry of payload.teeth) {
    if (entry.tooth !== null) put(entry.tooth, entry.marks);
    else for (const tooth of selected) put(tooth, entry.marks);
  }

  // A tooth that ended up as it was needs no write.
  for (const [tooth, marks] of changes) {
    const before = marksOf(tooth);
    if (serializeFindings(before.findings) === serializeFindings(marks.findings) && serializeProcedures(before.procedures) === serializeProcedures(marks.procedures)) {
      changes.delete(tooth);
    }
  }
  return { changes, skipped, needsSelection };
}

/** Whether the template is meant for this species (a template of the other species is not offered). */
export function fitsSpecies(templateSpecies: Species | null, species: Species): boolean {
  return templateSpecies === null || templateSpecies === species;
}

export { EMPTY_MARKS };
