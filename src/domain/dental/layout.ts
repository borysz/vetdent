import { getOdontogramRows, type Quadrant, type Species, type ToothDefinition } from "@/domain/teeth/catalog";

/**
 * The dental chart is laid out as four quadrant rows (two per jaw), so the
 * whole dentition fits an upright tablet and an A4 page without scrolling or
 * shrinking the teeth. The patient's right quadrant comes first in each jaw.
 */

export interface QuadrantRow {
  quadrant: Quadrant;
  teeth: ToothDefinition[];
}

/** The teeth of a jaw as drawn, split into its two quadrants. */
export function quadrantsOf(row: readonly ToothDefinition[]): QuadrantRow[] {
  const groups: QuadrantRow[] = [];
  for (const tooth of row) {
    const last = groups[groups.length - 1];
    if (last && last.quadrant === tooth.quadrant) last.teeth.push(tooth);
    else groups.push({ quadrant: tooth.quadrant, teeth: [tooth] });
  }
  return groups;
}

export function quadrantRows(species: Species): { upper: QuadrantRow[]; lower: QuadrantRow[] } {
  const rows = getOdontogramRows(species);
  return { upper: quadrantsOf(rows.upper), lower: quadrantsOf(rows.lower) };
}
