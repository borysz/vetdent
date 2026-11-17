/**
 * The shape of the schematic teeth, shared by everything that draws them (the
 * dental chart on the screen and the PDF summary), so a tooth looks the same
 * everywhere. Own simple figures; the reference images are not used.
 *
 * Drawn for an upper tooth in a 40 x 60 box (roots up, crown down); a lower
 * tooth is the same figure turned over.
 */

import type { ToothColor } from "./chart";
import type { ToothType } from "@/domain/teeth/catalog";

export const TOOTH_BOX = { width: 40, height: 60 } as const;

export const CROWN_PATHS: Readonly<Record<ToothType, string>> = {
  incisor: "M12 30 Q20 26 28 30 L27 55 Q20 59 13 55 Z",
  canine: "M9 30 Q20 26 31 30 L22 58 Q20 60 18 58 Z",
  premolar: "M7 30 Q20 26 33 30 L31 51 L26 57 L20 51 L14 57 L9 51 Z",
  molar: "M3 30 Q20 26 37 30 L36 49 L30 57 L25 51 L20 57 L15 51 L10 57 L4 49 Z",
};

/** Horizontal centres of the root tips, by number of roots. */
export const ROOT_X: Readonly<Record<1 | 2 | 3, readonly number[]>> = {
  1: [20],
  2: [12, 28],
  3: [8, 20, 32],
};

export function rootPath(x: number): string {
  return `M${x - 5} 31 L${x} 3 L${x + 5} 31 Z`;
}

/**
 * The colours of the chart as hex values, for drawing outside the stylesheet
 * (PDF). They are the `--color-tooth-*` tokens of `globals.css`; a test keeps
 * the two in step. `null`: no fill.
 */
export const TOOTH_COLOR_HEX: Readonly<Record<ToothColor, string | null>> = {
  red: "#d43a2f",
  blue: "#2f6fd4",
  orange: "#ea7a1a",
  yellow: "#e0ad00",
  green: "#2e9e5b",
  gray: null,
  none: "#ffffff",
};

/** The grey of a missing tooth's dashed outline. */
export const MISSING_OUTLINE_HEX = "#96a3ab";
