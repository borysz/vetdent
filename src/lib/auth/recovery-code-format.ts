import { createHash, randomBytes } from "node:crypto";

/**
 * Format of two-step verification recovery codes: 12 characters from an
 * unambiguous alphabet (no 0/O, 1/I/L), shown in groups of four. That is
 * about 59 bits of randomness per code – far beyond guessing.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 12;
export const RECOVERY_CODE_COUNT = 10;

export function createRecoveryCode(): string {
  let code = "";
  while (code.length < CODE_LENGTH) {
    // Rejection sampling keeps every character equally likely.
    for (const byte of randomBytes(CODE_LENGTH)) {
      if (byte < ALPHABET.length * Math.floor(256 / ALPHABET.length) && code.length < CODE_LENGTH) {
        code += ALPHABET[byte % ALPHABET.length];
      }
    }
  }
  return formatRecoveryCode(code);
}

/** Groups a code as XXXX-XXXX-XXXX for display. */
export function formatRecoveryCode(code: string): string {
  return (normalizeRecoveryCode(code).match(/.{1,4}/g) ?? []).join("-");
}

/** Strips separators and case, so "abcd efgh-jkmn" and "ABCD-EFGH-JKMN" are the same code. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isRecoveryCodeShaped(input: string): boolean {
  const code = normalizeRecoveryCode(input);
  return code.length === CODE_LENGTH && [...code].every((char) => ALPHABET.includes(char));
}

/** What is stored in the database instead of the code. */
export function hashRecoveryCode(input: string): string {
  return createHash("sha256").update(normalizeRecoveryCode(input)).digest("hex");
}
