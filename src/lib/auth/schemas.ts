import { z } from "zod";

/**
 * Validation for the authentication forms. Each issue's message is a
 * translation key under `auth.validation`; the same schemas can be used on
 * the client and on the server.
 */
export type AuthValidationKey = "fullNameRequired" | "emailInvalid" | "passwordRequired" | "passwordTooShort";

export const MIN_PASSWORD_LENGTH = 10;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("emailInvalid" satisfies AuthValidationKey).max(320, "emailInvalid" satisfies AuthValidationKey));

const newPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, "passwordTooShort" satisfies AuthValidationKey)
  // bcrypt, used by the auth server, only considers the first 72 bytes.
  .max(72, "passwordTooShort" satisfies AuthValidationKey);

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "passwordRequired" satisfies AuthValidationKey),
});

export const signUpSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "fullNameRequired" satisfies AuthValidationKey)
    .max(200, "fullNameRequired" satisfies AuthValidationKey),
  email,
  password: newPassword,
});

export const forgotPasswordSchema = z.object({ email });

export const newPasswordSchema = z.object({ password: newPassword });
