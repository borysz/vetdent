import { badgeOf } from "@/domain/dental/codes";
import { formatDate, type Translate } from "@/domain/summary/summary";

/**
 * What the server kept in `sync_conflicts`: a value that lost against another
 * (two devices edited the same field, or an edit reached a finished visit),
 * kept so that nothing is lost silently. This module turns such a value into
 * a line a person can read.
 */

export const CONFLICT_TABLES = ["clients", "patients", "visits", "visit_teeth", "templates", "attachments"] as const;
export type ConflictTable = (typeof CONFLICT_TABLES)[number];

export function isConflictTable(value: string): value is ConflictTable {
  return (CONFLICT_TABLES as readonly string[]).includes(value);
}

/** The text key of a field's name; the page falls back to the raw name when there is none. */
export function conflictFieldKey(table: ConflictTable, field: string): string {
  return `conflicts.fields.${table}.${field}`;
}

const MAX_LENGTH = 300;

function shorten(text: string): string {
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH)}…` : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function listItem(item: unknown, t: Translate): string {
  if (isRecord(item)) {
    // A finding or procedure of a tooth.
    if (typeof item.code === "string") {
      const badge = badgeOf(item.code, typeof item.level === "string" ? item.level : "");
      return item.state === "planned" ? `${badge} (${t("conflicts.planned")})` : badge;
    }
    // A medicine: its name and dose.
    if (typeof item.name === "string") {
      return [item.name, item.dose].filter((part): part is string => typeof part === "string" && part !== "").join(" ");
    }
    return Object.entries(item)
      .map(([key, value]) => `${key}: ${formatConflictValue("", value, t)}`)
      .join(", ");
  }
  return formatConflictValue("", item, t);
}

/**
 * A stored value as text. Lists travel as JSON text, so a text that is a JSON
 * list or object is read first.
 */
export function formatConflictValue(field: string, value: unknown, t: Translate): string {
  if (value === null || value === undefined || value === "") return t("conflicts.empty");
  if (typeof value === "boolean") return t(value ? "summary.yes" : "summary.no");
  if (typeof value === "number") return String(value);

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        return formatConflictValue(field, JSON.parse(trimmed) as unknown, t);
      } catch {
        // Not JSON after all: shown as written.
      }
    }
    return shorten(/^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? formatDate(trimmed) : value);
  }

  if (Array.isArray(value)) {
    return value.length === 0 ? t("conflicts.empty") : shorten(value.map((item) => listItem(item, t)).join(", "));
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    return entries.length === 0 ? t("conflicts.empty") : shorten(entries.map(([key, entry]) => `${key}: ${formatConflictValue("", entry, t)}`).join(", "));
  }
  return shorten(JSON.stringify(value));
}
