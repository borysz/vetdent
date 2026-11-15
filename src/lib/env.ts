import { z } from "zod";

/**
 * Environment variables that are safe to expose to the browser.
 * Server-only secrets get their own schema in a server-only module when the
 * first one is needed, so they can never be imported into client code.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Validates the given variables. Kept separate from `process.env` so it can
 * be unit tested.
 */
export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration – ${problems}. See .env.example.`);
  }
  return result.data;
}

// NEXT_PUBLIC_* variables must be referenced literally to be inlined into the client bundle.
export const publicEnv: PublicEnv = parsePublicEnv({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
