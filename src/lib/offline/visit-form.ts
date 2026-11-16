/** Small, pure helpers of the visit screen: what the user types versus what is stored. */

/** Translation keys under `visits.validation`. */
export type VisitValidationKey = "dateInvalid" | "weightInvalid" | "dateTimeInvalid" | "followUpInvalid" | "tooLong";

/** Today as `YYYY-MM-DD` in the device's own time zone. */
export function todayText(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** The visit date: a real date from 2000 on, at most a day ahead (a visit entered around midnight). */
export function validVisitDate(value: string, now: Date = new Date()): boolean {
  if (!isRealDate(value) || value < "2000-01-01") return false;
  const limit = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return value <= todayText(limit);
}

/** The follow-up date: a real date from 2000 on, at most two years ahead. */
export function validFollowUpDate(value: string, now: Date = new Date()): boolean {
  if (!isRealDate(value) || value < "2000-01-01") return false;
  const limit = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());
  return value <= todayText(limit);
}

/** The weight the user typed: "4,5" and "4.5" are both fine. Empty means "no value". */
export function parseWeight(text: string): number | null | "invalid" {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  const number = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(number) || number <= 0 || number > 200) return "invalid";
  return Math.round(number * 100) / 100;
}

/** `<input type="datetime-local">` gives `YYYY-MM-DDTHH:mm`; it is stored with seconds, as the database returns it. */
export function toStoredDateTime(inputValue: string): string | null | "invalid" {
  const trimmed = inputValue.trim();
  if (trimmed.length === 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed) || !isRealDate(trimmed.slice(0, 10))) return "invalid";
  return `${trimmed}:00`;
}

export function toInputDateTime(stored: string | null): string {
  return stored ? stored.slice(0, 16) : "";
}

/** The check-up is suggested 12 days after the visit (10–14 days when there are stitches). */
export const SUGGESTED_FOLLOW_UP_DAYS = 12;

export function suggestedFollowUp(visitDate: string, days: number = SUGGESTED_FOLLOW_UP_DAYS): string | null {
  if (!isRealDate(visitDate)) return null;
  const [year, month, day] = visitDate.split("-").map(Number);
  return todayText(new Date(year, month - 1, day + days));
}

/** `null` for blank text, otherwise the trimmed text. */
export function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Age in whole years and months from a birth date (`YYYY-MM-DD`), as of `now`; `null` without a valid date. */
export function ageOf(birthDate: string | null, now: Date = new Date()): { years: number; months: number } | null {
  if (!birthDate || !isRealDate(birthDate)) return null;
  const [year, month, day] = birthDate.split("-").map(Number);
  let months = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
  if (now.getDate() < day) months -= 1;
  if (months < 0) return null;
  return { years: Math.floor(months / 12), months: months % 12 };
}
