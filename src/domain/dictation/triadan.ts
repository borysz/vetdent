/**
 * Dictation (PROJEKT_PROMPT 8.9): finding the tooth a spoken note is about.
 *
 * "A 104-es fog gyökerénél sipolynyílás van" belongs to tooth 104. A number is
 * taken for a tooth only if it is a Triadan number the species has, stands on
 * its own (not inside a longer number) and is not a measurement ("110 mg").
 */

import { getTeeth, isValidTooth, type Species } from "@/domain/teeth/catalog";

/** Three digits: quadrant 1–4, then position 01–11. */
const CANDIDATE = /(?<![\d.,])([1-4](?:0[1-9]|1[01]))(?![\d])(?!\s*(?:mg|ml|mm|kg|g\b|µg|mcg|%|fok|nap|tabletta))/gi;

/** The teeth named in the text, in the order they are first mentioned, without repeats. */
export function findTeeth(text: string, species: Species): number[] {
  const found: number[] = [];
  for (const match of text.matchAll(CANDIDATE)) {
    const tooth = Number(match[1]);
    if (isValidTooth(species, tooth) && !found.includes(tooth)) found.push(tooth);
  }
  return found;
}

export type DictationTarget = { kind: "tooth"; tooth: number } | { kind: "general" };

/**
 * Where the text goes unless the user says otherwise: the first tooth named in
 * it; failing that the one tooth that is selected; failing that the visit's
 * general note.
 */
export function suggestTarget(text: string, species: Species, selected: readonly number[]): DictationTarget {
  const named = findTeeth(text, species);
  if (named.length > 0) return { kind: "tooth", tooth: named[0] };
  if (selected.length === 1) return { kind: "tooth", tooth: selected[0] };
  return { kind: "general" };
}

/** What the confirmation offers as a place: the general note, teeth named or selected first, then all teeth. */
export function targetOptions(text: string, species: Species, selected: readonly number[]): DictationTarget[] {
  const teeth: number[] = [];
  for (const tooth of [...findTeeth(text, species), ...selected, ...getTeeth(species).map((t) => t.number)]) {
    if (!teeth.includes(tooth)) teeth.push(tooth);
  }
  return [{ kind: "general" }, ...teeth.map((tooth): DictationTarget => ({ kind: "tooth", tooth }))];
}

export function sameTarget(a: DictationTarget, b: DictationTarget): boolean {
  return a.kind === b.kind && (a.kind === "general" || (b.kind === "tooth" && a.tooth === b.tooth));
}

/** Appends a dictated text to what is already in a field, on a new line. */
export function appendText(existing: string, addition: string): string {
  const text = addition.trim();
  if (text.length === 0) return existing;
  return existing.trim().length === 0 ? text : `${existing.trimEnd()}\n${text}`;
}
