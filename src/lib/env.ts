import { z } from "zod";

/**
 * Environment variables that are safe to expose to the browser.
 * Server-only secrets live in `env.server.ts`, which cannot be imported into
 * client code.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/** Formats validation problems so the message names each offending variable. */
export function describeEnvProblems(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

/**
 * Validates the given variables. Kept separate from `process.env` so it can
 * be unit tested.
 */
export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration – ${describeEnvProblems(result.error)}. See .env.example.`);
  }
  return result.data;
}

// NEXT_PUBLIC_* variables must be referenced literally to be inlined into the client bundle.
export const publicEnv: PublicEnv = parsePublicEnv({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});
