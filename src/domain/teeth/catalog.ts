/**
 * Tooth catalogue for the permanent dentition of dogs and cats,
 * using the modified Triadan numbering system.
 *
 * The catalogue is data, not UI: components render from it and never
 * hard-code tooth numbers. Deciduous teeth (Triadan 500–800) and further
 * species can be added later by extending `POSITIONS`.
 *
 * NOTE: root counts need sign-off by a veterinarian before go-live
 * (see docs/SZAKMAI_ELLENORZES.md).
 */

export const SPECIES = ["dog", "cat"] as const;
export type Species = (typeof SPECIES)[number];

/** Triadan quadrant: 1 = upper right, 2 = upper left, 3 = lower left, 4 = lower right. */
export type Quadrant = 1 | 2 | 3 | 4;
export type Jaw = "maxilla" | "mandible";
/** The patient's side, not the screen side. */
export type Side = "right" | "left";
export type ToothType = "incisor" | "canine" | "premolar" | "molar";
export type RootCount = 1 | 2 | 3;

export interface ToothDefinition {
  /** Triadan number, e.g. 104 = upper right canine. */
  readonly number: number;
  readonly quadrant: Quadrant;
  /** Position within the quadrant (the last two Triadan digits), 1–11. */
  readonly position: number;
  readonly type: ToothType;
  readonly jaw: Jaw;
  readonly side: Side;
  readonly roots: RootCount;
}

type PositionMap = Readonly<Record<number, RootCount>>;

/** Position → root count, per species and jaw. Absent positions do not exist in that species. */
const POSITIONS: Readonly<Record<Species, Readonly<Record<Jaw, PositionMap>>>> = {
  dog: {
    maxilla: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 3, 9: 3, 10: 3 },
    mandible: { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 2, 9: 2, 10: 2, 11: 1 },
  },
  cat: {
    maxilla: { 1: 1, 2: 1, 3: 1, 4: 1, 6: 1, 7: 2, 8: 3, 9: 2 },
    mandible: { 1: 1, 2: 1, 3: 1, 4: 1, 7: 2, 8: 2, 9: 2 },
  },
};

const QUADRANTS: readonly Quadrant[] = [1, 2, 3, 4];

export function jawOfQuadrant(quadrant: Quadrant): Jaw {
  return quadrant === 1 || quadrant === 2 ? "maxilla" : "mandible";
}

export function sideOfQuadrant(quadrant: Quadrant): Side {
  return quadrant === 1 || quadrant === 4 ? "right" : "left";
}

/** Tooth type follows from the Triadan position: 01–03 incisors, 04 canine, 05–08 premolars, 09–11 molars. */
export function toothTypeOfPosition(position: number): ToothType {
  if (position <= 3) return "incisor";
  if (position === 4) return "canine";
  if (position <= 8) return "premolar";
  return "molar";
}

function buildCatalog(species: Species): readonly ToothDefinition[] {
  const teeth: ToothDefinition[] = [];
  for (const quadrant of QUADRANTS) {
    const jaw = jawOfQuadrant(quadrant);
    const positions = POSITIONS[species][jaw];
    for (const [key, roots] of Object.entries(positions)) {
      const position = Number(key);
      teeth.push({
        number: quadrant * 100 + position,
        quadrant,
        position,
        type: toothTypeOfPosition(position),
        jaw,
        side: sideOfQuadrant(quadrant),
        roots,
      });
    }
  }
  return teeth.sort((a, b) => a.number - b.number);
}

const CATALOGS: Readonly<Record<Species, readonly ToothDefinition[]>> = {
  dog: buildCatalog("dog"),
  cat: buildCatalog("cat"),
};

const BY_NUMBER: Readonly<Record<Species, ReadonlyMap<number, ToothDefinition>>> = {
  dog: new Map(CATALOGS.dog.map((tooth) => [tooth.number, tooth])),
  cat: new Map(CATALOGS.cat.map((tooth) => [tooth.number, tooth])),
};

/** All permanent teeth of a species, ordered by Triadan number. */
export function getTeeth(species: Species): readonly ToothDefinition[] {
  return CATALOGS[species];
}

export function getTooth(species: Species, toothNumber: number): ToothDefinition | undefined {
  return BY_NUMBER[species].get(toothNumber);
}

export function isValidTooth(species: Species, toothNumber: number): boolean {
  return BY_NUMBER[species].has(toothNumber);
}

export function getTeethInQuadrant(species: Species, quadrant: Quadrant): readonly ToothDefinition[] {
  return CATALOGS[species].filter((tooth) => tooth.quadrant === quadrant);
}

/** Furcation involvement can only be recorded on multi-rooted teeth. */
export function canHaveFurcation(tooth: ToothDefinition): boolean {
  return tooth.roots > 1;
}

export interface OdontogramRows {
  /** Upper jaw in screen order, left to right: quadrant 1 (distal → mesial), then quadrant 2 (mesial → distal). */
  readonly upper: readonly ToothDefinition[];
  /** Lower jaw in screen order, left to right: quadrant 4 (distal → mesial), then quadrant 3 (mesial → distal). */
  readonly lower: readonly ToothDefinition[];
}

/**
 * Teeth in the order they are drawn on screen. The patient's right side is on
 * the left edge of the screen, as on a radiograph:
 *   upper: 110 → 101 | 201 → 210
 *   lower: 411 → 401 | 301 → 311
 */
export function getOdontogramRows(species: Species): OdontogramRows {
  const descending = (quadrant: Quadrant) => [...getTeethInQuadrant(species, quadrant)].reverse();
  const ascending = (quadrant: Quadrant) => [...getTeethInQuadrant(species, quadrant)];
  return {
    upper: [...descending(1), ...ascending(2)],
    lower: [...descending(4), ...ascending(3)],
  };
}
