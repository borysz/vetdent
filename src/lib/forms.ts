import type { z } from "zod";

/**
 * State returned by form Server Actions (used with React's `useActionState`).
 *
 * `values` carries the submitted, non-secret field values back to the form,
 * because React resets uncontrolled inputs after an action completes. Never
 * put a password into it.
 */
export type FormState =
  | { status: "idle" }
  | {
      status: "error";
      /** Form-level error, already translated. */
      message?: string;
      /** Field name → already translated error. */
      fieldErrors?: Readonly<Record<string, string>>;
      values?: Readonly<Record<string, string>>;
    }
  | {
      status: "success";
      message?: string;
      /** Extra, non-secret values the form needs to show the result. */
      data?: Readonly<Record<string, string>>;
    };

export const initialFormState: FormState = { status: "idle" };

/** Reads a form field as a string ("" when missing or when it is a file). */
export function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Turns zod issues into `fieldName → translated message`. Schemas put a
 * translation key into each issue's message; `translate` resolves it.
 * Only the first problem of each field is kept.
 */
export function fieldErrorsFrom<Key extends string>(
  error: z.ZodError,
  translate: (key: Key) => string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const name = String(issue.path[0] ?? "");
    if (name && !(name in errors)) {
      errors[name] = translate(issue.message as Key);
    }
  }
  return errors;
}
