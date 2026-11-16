/**
 * The quick-entry panel (PROJEKT_PROMPT 8.5): the buttons shown by default.
 * Data, not UI. Order and content per organization, and composite buttons of
 * their own, come later (see docs/NYITOTT_KERDESEK.md).
 */

import type { Species } from "@/domain/teeth/catalog";
import { getCode, type AnyCode } from "./codes";

export interface QuickAction {
  code: AnyCode;
}

export interface QuickButton {
  /** Stable id, also the key of its label under `dental.quick` in the texts. */
  readonly id: string;
  /** One code, or several for a composite button ("tartar removal + polishing"). */
  readonly actions: readonly QuickAction[];
  /** Only offered for this species. */
  readonly species?: Species;
}

const single = (code: AnyCode): QuickButton => ({ id: code, actions: [{ code }], species: getCode(code)?.species });

export const DEFAULT_QUICK_BUTTONS: readonly QuickButton[] = [
  single("0"),
  single("T"),
  single("G"),
  single("PD"),
  single("Mob"),
  single("Fur"),
  single("FX"),
  single("RES"),
  single("M"),
  single("U"),
  single("POL"),
  { id: "U+POL", actions: [{ code: "U" }, { code: "POL" }] },
  single("EXT"),
  single("ENDO"),
  single("RX"),
];

export function quickButtonsFor(species: Species): readonly QuickButton[] {
  return DEFAULT_QUICK_BUTTONS.filter((button) => !button.species || button.species === species);
}

/**
 * The grade or subtype a button has to ask for, if any: a button of a single
 * code that has levels. Composite buttons never ask.
 */
export function levelsOf(button: QuickButton): readonly string[] {
  if (button.actions.length !== 1) return [];
  return getCode(button.actions[0].code)?.levels ?? [];
}
