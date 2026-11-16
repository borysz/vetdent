/**
 * The three list-valued parts of a visit (complaint tags, local anaesthesia
 * blocks, medications). The sync protocol carries only scalars, so on the
 * device and on the wire a list is JSON text in one fixed ("canonical") form:
 * the same list always gives the same text, which is what lets the record
 * rules tell whether an edit really changed anything.
 */

export const COMPLAINT_TAGS = ["halitosis", "tartar", "drooling", "eating_difficulty", "pain"] as const;
export type ComplaintTag = (typeof COMPLAINT_TAGS)[number];

export const BLOCK_SIDES = ["", "left", "right", "both"] as const;

export interface AnesthesiaBlock {
  nerve: string;
  /** One of `BLOCK_SIDES`; empty when not stated. */
  side: string;
  agent: string;
  dose: string;
}

export interface Medication {
  name: string;
  dose: string;
  frequency: string;
  duration: string;
}

export const EMPTY_BLOCK: AnesthesiaBlock = { nerve: "", side: "", agent: "", dose: "" };
export const EMPTY_MEDICATION: Medication = { name: "", dose: "", frequency: "", duration: "" };

export const MAX_BLOCKS = 20;
export const MAX_MEDICATIONS = 20;

/** The text every empty list is stored as. */
export const EMPTY_LIST_TEXT = "[]";

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

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function parseTags(value: unknown): ComplaintTag[] {
  const seen = new Set<string>(asArray(value).filter((item): item is string => typeof item === "string"));
  // Always in the order of the catalogue, so equal sets give equal text.
  return COMPLAINT_TAGS.filter((tag) => seen.has(tag));
}

export function parseBlocks(value: unknown): AnesthesiaBlock[] {
  return asArray(value)
    .flatMap((item) => {
      if (item === null || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      const side = text(record.side, 10);
      return [
        {
          nerve: text(record.nerve, 100),
          side: (BLOCK_SIDES as readonly string[]).includes(side) ? side : "",
          agent: text(record.agent, 100),
          dose: text(record.dose, 100),
        },
      ];
    })
    .filter((block) => block.nerve !== "")
    .slice(0, MAX_BLOCKS);
}

export function parseMedications(value: unknown): Medication[] {
  return asArray(value)
    .flatMap((item) => {
      if (item === null || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      return [
        {
          name: text(record.name, 200),
          dose: text(record.dose, 200),
          frequency: text(record.frequency, 200),
          duration: text(record.duration, 200),
        },
      ];
    })
    .filter((medication) => medication.name !== "")
    .slice(0, MAX_MEDICATIONS);
}

export function serializeTags(tags: readonly string[]): string {
  return JSON.stringify(parseTags(tags));
}

export function serializeBlocks(blocks: readonly Partial<AnesthesiaBlock>[]): string {
  return JSON.stringify(parseBlocks(blocks));
}

export function serializeMedications(medications: readonly Partial<Medication>[]): string {
  return JSON.stringify(parseMedications(medications));
}
