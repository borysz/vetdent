import { z } from "zod";
import { SEX_VALUES, SPECIES_VALUES, type PatientFields } from "./patients-model";

/** Translation keys under `patients.validation`. */
export type PatientValidationKey =
  | "ownerRequired"
  | "nameRequired"
  | "speciesRequired"
  | "birthDateInvalid"
  | "weightInvalid"
  | "microchipInvalid"
  | "tooLong";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong" satisfies PatientValidationKey)
    .transform((value) => (value.length === 0 ? null : value));

/** Today as `YYYY-MM-DD` in the device's own time zone. */
function today(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export interface PatientFormInput {
  clientId: string;
  name: string;
  species: string;
  breed: string;
  birthDate: string;
  sex: string;
  neutered: boolean;
  weight: string;
  microchip: string;
  notes: string;
}

export type PatientFormResult =
  | { ok: true; fields: PatientFields }
  | { ok: false; errors: Partial<Record<keyof PatientFields, PatientValidationKey>> };

/** The same rules the server applies, so a record is rarely refused after the fact. */
export function parsePatientForm(input: PatientFormInput, now: Date = new Date()): PatientFormResult {
  const todayText = today(now);

  const schema = z.object({
    clientId: z.string().trim().min(1, "ownerRequired" satisfies PatientValidationKey),
    name: z
      .string()
      .trim()
      .min(1, "nameRequired" satisfies PatientValidationKey)
      .max(100, "tooLong" satisfies PatientValidationKey),
    species: z.enum(SPECIES_VALUES, "speciesRequired" satisfies PatientValidationKey),
    breed: optionalText(100),
    birthDate: z
      .string()
      .trim()
      .refine(
        (value) => value.length === 0 || (isRealDate(value) && value <= todayText && value >= "1990-01-01"),
        "birthDateInvalid" satisfies PatientValidationKey,
      )
      .transform((value) => (value.length === 0 ? null : value)),
    sex: z.enum(SEX_VALUES),
    neutered: z.boolean(),
    // Hungarian users type "4,5"; both separators are accepted.
    weight: z
      .string()
      .trim()
      .refine((value) => {
        if (value.length === 0) return true;
        const number = Number(value.replace(",", "."));
        return Number.isFinite(number) && number > 0 && number <= 200;
      }, "weightInvalid" satisfies PatientValidationKey)
      .transform((value) => (value.length === 0 ? null : Math.round(Number(value.replace(",", ".")) * 100) / 100)),
    microchip: z
      .string()
      .trim()
      .refine((value) => value.length === 0 || /^[0-9A-Za-z]{9,20}$/.test(value), "microchipInvalid" satisfies PatientValidationKey)
      .transform((value) => (value.length === 0 ? null : value)),
    notes: optionalText(2000),
  });

  const result = schema.safeParse(input);
  if (result.success) {
    const { weight, ...rest } = result.data;
    return { ok: true, fields: { ...rest, weightKg: weight } };
  }

  const errors: Partial<Record<keyof PatientFields, PatientValidationKey>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0] === "weight" ? "weightKg" : (issue.path[0] as keyof PatientFields | undefined);
    if (key && !(key in errors)) errors[key] = issue.message as PatientValidationKey;
  }
  return { ok: false, errors };
}
