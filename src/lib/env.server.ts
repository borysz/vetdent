import "server-only";
import { z } from "zod";
import { describeEnvProblems } from "./env";

/**
 * Server-only secrets. The `server-only` import makes the build fail if this
 * module is ever pulled into client code.
 */
const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/**
 * Read lazily, so pages that never need a secret still render when one is
 * missing (and the error appears where the secret is actually used).
 */
export function getServerEnv(): ServerEnv {
  if (!cached) {
    const result = serverEnvSchema.safeParse({
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    });
    if (!result.success) {
      throw new Error(`Invalid server configuration – ${describeEnvProblems(result.error)}. See .env.example.`);
    }
    cached = result.data;
  }
  return cached;
}
