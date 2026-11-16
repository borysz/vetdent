/**
 * The rules of a dental chart (PROJEKT_PROMPT 8.3–8.6), without any screen or
 * storage: what a tooth carries, which marks may be added, what colour a tooth
 * gets, what carries over to the next visit, and how teeth are selected.
 */

import {
  getTeeth,
  getTeethInQuadrant,
  type Quadrant,
  type Species,
  type ToothDefinition,
  type ToothType,
} from "@/domain/teeth/catalog";
import {
  codeOrder,
  getCode,
  isFindingCode,
  isProcedureCode,
  isValidLevel,
  type FindingCode,
  type ProcedureCode,
} from "./codes";

export const PROCEDURE_STATES = ["planned", "done"] as const;
export type ProcedureState = (typeof PROCEDURE_STATES)[number];

export interface Finding {
  code: FindingCode;
  /** Grade or subtype id; empty if the code has none. */
  level: string;
}

export interface Procedure {
  code: ProcedureCode;
  level: string;
  state: ProcedureState;
}

/** Everything recorded on one tooth in one visit (pocket depths and the note are kept apart). */
export interface ToothMarks {
  findings: Finding[];
  procedures: Procedure[];
}

export const EMPTY_MARKS: ToothMarks = { findings: [], procedures: [] };

// ---------------------------------------------------------------------------
// Text form (what is stored and synchronised): canonical JSON
// ---------------------------------------------------------------------------

function asArray(value: unknown): unknown[] {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value : [];
}

/** One mark per code (the last one wins), in catalogue order, invalid ones dropped. */
export function parseFindings(value: unknown): Finding[] {
  const byCode = new Map<string, Finding>();
  for (const item of asArray(value)) {
    if (item === null || typeof item !== "object") continue;
    const { code, level } = item as Record<string, unknown>;
    if (typeof code !== "string" || !isFindingCode(code)) continue;
    const levelText = typeof level === "string" ? level : "";
    if (isValidLevel(code, levelText)) byCode.set(code, { code, level: levelText });
  }
  return [...byCode.values()].sort((a, b) => codeOrder(a.code) - codeOrder(b.code));
}

export function parseProcedures(value: unknown): Procedure[] {
  const byCode = new Map<string, Procedure>();
  for (const item of asArray(value)) {
    if (item === null || typeof item !== "object") continue;
    const { code, level, state } = item as Record<string, unknown>;
    if (typeof code !== "string" || !isProcedureCode(code)) continue;
    const levelText = typeof level === "string" ? level : "";
    if (!isValidLevel(code, levelText)) continue;
    byCode.set(code, { code, level: levelText, state: state === "planned" ? "planned" : "done" });
  }
  return [...byCode.values()].sort((a, b) => codeOrder(a.code) - codeOrder(b.code));
}

export function serializeFindings(findings: readonly Finding[]): string {
  return JSON.stringify(parseFindings(findings).map(({ code, level }) => ({ code, level })));
}

export function serializeProcedures(procedures: readonly Procedure[]): string {
  return JSON.stringify(parseProcedures(procedures).map(({ code, level, state }) => ({ code, level, state })));
}

export const EMPTY_LIST_TEXT = "[]";

// ---------------------------------------------------------------------------
// Changing marks
// ---------------------------------------------------------------------------

export function isMissing(marks: ToothMarks): boolean {
  return marks.findings.some((finding) => finding.code === "M");
}

export function isEmpty(marks: ToothMarks): boolean {
  return marks.findings.length === 0 && marks.procedures.length === 0;
}

export type RefusalReason = "invalid" | "species" | "furcation" | "missing";

export type CanApply = { ok: true } | { ok: false; reason: RefusalReason };

/**
 * Whether a mark may be put on a tooth: the code must exist (with that grade),
 * belong to the species, fit the tooth (furcation only on multi-rooted teeth),
 * and a missing tooth takes no new mark – except changing how it is missing.
 */
export function canApply(species: Species, tooth: ToothDefinition, marks: ToothMarks, code: string, level: string): CanApply {
  const definition = getCode(code);
  if (!definition || !isValidLevel(code, level)) return { ok: false, reason: "invalid" };
  if (definition.species && definition.species !== species) return { ok: false, reason: "species" };
  if (definition.multiRootOnly && tooth.roots < 2) return { ok: false, reason: "furcation" };
  if (isMissing(marks) && code !== "M") return { ok: false, reason: "missing" };
  return { ok: true };
}

/**
 * Puts a finding on a tooth, replacing the earlier mark of the same code.
 * "Healthy" excludes every other finding; a missing tooth has nothing else on it.
 */
export function withFinding(marks: ToothMarks, code: FindingCode, level: string): ToothMarks {
  if (code === "M") return { findings: [{ code, level }], procedures: [] };
  if (code === "0") return { findings: [{ code, level }], procedures: marks.procedures };
  const others = marks.findings.filter((finding) => finding.code !== code && finding.code !== "0");
  return { findings: parseFindings([...others, { code, level }]), procedures: marks.procedures };
}

export function withProcedure(marks: ToothMarks, code: ProcedureCode, level: string, state: ProcedureState): ToothMarks {
  const others = marks.procedures.filter((procedure) => procedure.code !== code);
  return { findings: marks.findings, procedures: parseProcedures([...others, { code, level, state }]) };
}

export function withoutCode(marks: ToothMarks, code: string): ToothMarks {
  return {
    findings: marks.findings.filter((finding) => finding.code !== code),
    procedures: marks.procedures.filter((procedure) => procedure.code !== code),
  };
}

export function withProcedureState(marks: ToothMarks, code: ProcedureCode, state: ProcedureState): ToothMarks {
  return {
    findings: marks.findings,
    procedures: marks.procedures.map((procedure) => (procedure.code === code ? { ...procedure, state } : procedure)),
  };
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

export const TOOTH_COLORS = ["red", "blue", "orange", "yellow", "green", "gray", "none"] as const;
export type ToothColor = (typeof TOOTH_COLORS)[number];

const ORANGE_FINDINGS: ReadonlySet<string> = new Set(["G", "PD", "FX", "RES", "Mob", "Fur"]);

/**
 * One look at the chart tells the state of the mouth. If several apply, the one
 * higher in this list wins: red (to be extracted / extracted) · blue (root
 * canal) · orange (inflamed or needs treatment) · yellow (tartar only) ·
 * green (healthy) · grey (missing). A tooth nobody has looked at has no colour.
 */
export function toothColor(marks: ToothMarks): ToothColor {
  if (marks.procedures.some((procedure) => procedure.code === "EXT")) return "red";
  if (marks.procedures.some((procedure) => procedure.code === "ENDO")) return "blue";
  if (marks.findings.some((finding) => ORANGE_FINDINGS.has(finding.code))) return "orange";
  if (marks.findings.some((finding) => finding.code === "T")) return "yellow";
  if (marks.findings.some((finding) => finding.code === "0")) return "green";
  if (isMissing(marks)) return "gray";
  return "none";
}

// ---------------------------------------------------------------------------
// Carry-over to the next visit
// ---------------------------------------------------------------------------

/**
 * What stays true after the visit and is carried to the patient's next one: a
 * missing tooth, a tooth that was extracted (it is now "extracted earlier"),
 * and a root-canal treated tooth. Everything else is a finding of that day.
 */
export function carriedOver(marks: ToothMarks): ToothMarks | null {
  const missing = marks.findings.find((finding) => finding.code === "M");
  if (missing) return { findings: [missing], procedures: [] };

  const extracted = marks.procedures.some((procedure) => procedure.code === "EXT" && procedure.state === "done");
  if (extracted) return { findings: [{ code: "M", level: "prev" }], procedures: [] };

  const rootCanal = marks.procedures.find((procedure) => procedure.code === "ENDO" && procedure.state === "done");
  if (rootCanal) return { findings: [], procedures: [rootCanal] };

  return null;
}

// ---------------------------------------------------------------------------
// Selecting teeth
// ---------------------------------------------------------------------------

export function selectAll(species: Species): number[] {
  return getTeeth(species).map((tooth) => tooth.number);
}

export function selectQuadrant(species: Species, quadrant: Quadrant): number[] {
  return getTeethInQuadrant(species, quadrant).map((tooth) => tooth.number);
}

export function selectArch(species: Species, arch: "upper" | "lower"): number[] {
  return getTeeth(species)
    .filter((tooth) => (arch === "upper" ? tooth.jaw === "maxilla" : tooth.jaw === "mandible"))
    .map((tooth) => tooth.number);
}

export function selectType(species: Species, type: ToothType): number[] {
  return getTeeth(species)
    .filter((tooth) => tooth.type === type)
    .map((tooth) => tooth.number);
}

// ---------------------------------------------------------------------------
// Pocket depth (PROJEKT_PROMPT 8.6)
// ---------------------------------------------------------------------------

/** Mesiobuccal, buccal, distobuccal, mesiolingual/palatal, lingual/palatal, distolingual/palatal. */
export const POCKET_POINTS = ["mb", "b", "db", "ml", "l", "dl"] as const;
export type PocketPoint = (typeof POCKET_POINTS)[number];

export const MAX_POCKET_MM = 12;
/** Depths above this are highlighted; the default of the first version, per species later. */
export const DEFAULT_POCKET_THRESHOLD_MM = 4;

export type PocketDepths = (number | null)[];

/** Six entries (a depth in whole millimetres, or `null` for "not measured"), or an empty list. */
export function parsePockets(value: unknown): PocketDepths {
  const list = asArray(value);
  if (list.length === 0) return [];
  const depths = POCKET_POINTS.map((_, index) => {
    const entry = list[index];
    return typeof entry === "number" && Number.isInteger(entry) && entry >= 0 && entry <= MAX_POCKET_MM ? entry : null;
  });
  return depths.every((depth) => depth === null) ? [] : depths;
}

export function serializePockets(depths: PocketDepths): string {
  return JSON.stringify(parsePockets(depths));
}

export function deepestPocket(depths: PocketDepths): number | null {
  const measured = depths.filter((depth): depth is number => depth !== null);
  return measured.length === 0 ? null : Math.max(...measured);
}

export function exceedsThreshold(depths: PocketDepths, threshold: number = DEFAULT_POCKET_THRESHOLD_MM): boolean {
  const deepest = deepestPocket(depths);
  return deepest !== null && deepest > threshold;
}

/**
 * A suggested PD grade from the deepest measured point – only a suggestion, the
 * grade is never set automatically. PD1 < 3 mm · PD2 3–4 mm · PD3 4–6 mm ·
 * PD4 > 6 mm. Below 3 mm nothing is suggested (a normal sulcus).
 */
export function suggestedPdLevel(depths: PocketDepths): "2" | "3" | "4" | null {
  const deepest = deepestPocket(depths);
  if (deepest === null || deepest < 3) return null;
  if (deepest <= 4) return "2";
  if (deepest <= 6) return "3";
  return "4";
}
