import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import type { Database } from "./database.types";

/**
 * Supabase client with the secret key. It BYPASSES row level security.
 *
 * This is the only place the secret key is used. Use it solely for work that
 * cannot run as a user: payment webhooks, platform administration and
 * background jobs. Never use it to serve a user's request for tenant data –
 * that must go through `createSupabaseServerClient()` so RLS applies.
 */
export function createSupabaseAdminClient() {
  return createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, getServerEnv().SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
