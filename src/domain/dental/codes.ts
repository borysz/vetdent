/**
 * Code catalogue of dental findings and procedures (PROJEKT_PROMPT 8.4).
 *
 * The codes are data, not UI. This is the system-wide base set; extensions per
 * organization come later (see docs/NYITOTT_KERDESEK.md). Display names live in
 * `messages/hu.json` under `dental.codes`; this module only knows the keys.
 *
 * NOTE: the codes, grades and their meaning need sign-off by a veterinarian
 * (see docs/SZAKMAI_ELLENORZES.md).
 */

import type { Species } from "@/domain/teeth/catalog";

export const FINDING_CODES = ["0", "T", "G", "PD", "Mob", "Fur", "FX", "RES", "M"] as const;
export type FindingCode = (typeof FINDING_CODES)[number];

export const PROCEDURE_CODES = ["U", "POL", "EXT", "ENDO", "RX"] as const;
export type ProcedureCode = (typeof PROCEDURE_CODES)[number];

export type CodeKind = "finding" | "procedure";
export type AnyCode = FindingCode | ProcedureCode;

export interface CodeDefinition {
  readonly code: AnyCode;
  readonly kind: CodeKind;
  /** Grades or subtypes; empty if the code has none. Ids, not display text. */
  readonly levels: readonly string[];
  /** Only for this species (resorptive lesions exist in cats only). */
  readonly species?: Species;
  /** Can only be recorded on a tooth with more than one root. */
  readonly multiRootOnly?: boolean;
}

export const CODES: readonly CodeDefinition[] = [
  { code: "0", kind: "finding", levels: [] },
  { code: "T", kind: "finding", levels: ["1", "2", "3"] },
  { code: "G", kind: "finding", levels: ["1", "2"] },
  { code: "PD", kind: "finding", levels: ["1", "2", "3", "4"] },
  { code: "Mob", kind: "finding", levels: ["1", "2", "3"] },
  { code: "Fur", kind: "finding", levels: ["1", "2", "3"], multiRootOnly: true },
  { code: "FX", kind: "finding", levels: ["C", "NC", "R"] },
  { code: "RES", kind: "finding", levels: ["1", "2", "3", "4", "5"], species: "cat" },
  // M: really missing / extracted earlier / impacted.
  { code: "M", kind: "finding", levels: ["missing", "prev", "imp"] },
  { code: "U", kind: "procedure", levels: [] },
  { code: "POL", kind: "procedure", levels: [] },
  { code: "EXT", kind: "procedure", levels: ["S", "SURG"] },
  { code: "ENDO", kind: "procedure", levels: ["closed", "open"] },
  { code: "RX", kind: "procedure", levels: [] },
];

const BY_CODE: ReadonlyMap<string, CodeDefinition> = new Map(CODES.map((definition) => [definition.code, definition]));

export function getCode(code: string): CodeDefinition | undefined {
  return BY_CODE.get(code);
}

export function isFindingCode(code: string): code is FindingCode {
  return BY_CODE.get(code)?.kind === "finding";
}

export function isProcedureCode(code: string): code is ProcedureCode {
  return BY_CODE.get(code)?.kind === "procedure";
}

/** A level is valid if the code has no levels and none is given, or the level is one of its levels. */
export function isValidLevel(code: string, level: string): boolean {
  const definition = BY_CODE.get(code);
  if (!definition) return false;
  return definition.levels.length === 0 ? level === "" : definition.levels.includes(level);
}

/** Position of a code in the catalogue; marks are always kept in this order so equal marks give equal text. */
export function codeOrder(code: string): number {
  return CODES.findIndex((definition) => definition.code === code);
}

/**
 * The short badge shown on a tooth card, so the meaning does not rest on the
 * colour alone: "T2", "PD3", "FX-C", "TR3", "M", "EXT-prev".
 */
export function badgeOf(code: string, level: string): string {
  switch (code) {
    case "RES":
      return `TR${level}`;
    case "M":
      return level === "prev" ? "EXT-prev" : level === "imp" ? "IMP" : "M";
    case "FX":
    case "EXT":
      return level ? `${code}-${level}` : code;
    case "ENDO":
      return "ENDO";
    case "0":
      return "0";
    default:
      return level ? `${code}${level}` : code;
  }
}
