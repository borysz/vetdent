import { z } from "zod";
import type { ClientFields } from "./clients-model";

/** Translation keys under `clients.validation`. */
export type ClientValidationKey = "nameRequired" | "emailInvalid" | "tooLong";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong" satisfies ClientValidationKey)
    .transform((value) => (value.length === 0 ? null : value));

const schema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "nameRequired" satisfies ClientValidationKey)
    .max(200, "tooLong" satisfies ClientValidationKey),
  phone: optionalText(50),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(320, "tooLong" satisfies ClientValidationKey)
    .refine((value) => value.length === 0 || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value), "emailInvalid" satisfies ClientValidationKey)
    .transform((value) => (value.length === 0 ? null : value)),
  address: optionalText(300),
  notes: optionalText(2000),
  emailConsent: z.boolean(),
});

export type ClientFormResult =
  | { ok: true; fields: ClientFields }
  | { ok: false; errors: Partial<Record<keyof ClientFields, ClientValidationKey>> };

/** The same rules the server applies, so a record is rarely refused after the fact. */
export function parseClientForm(input: {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  emailConsent: boolean;
}): ClientFormResult {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, fields: result.data };

  const errors: Partial<Record<keyof ClientFields, ClientValidationKey>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof ClientFields | undefined;
    if (field && !(field in errors)) errors[field] = issue.message as ClientValidationKey;
  }
  return { ok: false, errors };
}
