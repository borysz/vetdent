import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthEvent } from "@/lib/audit/actions";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Records an event about the signed-in user's own session in the audit log
 * of every organization they belong to.
 *
 * Logging must never break the action it accompanies (a sign-in that worked
 * stays a sign-in that worked), so failures are reported to the server log
 * and otherwise ignored.
 */
export async function logAuthEvent(supabase: SupabaseClient<Database>, event: AuthEvent): Promise<void> {
  const { error } = await supabase.rpc("log_auth_event", { p_event: event });
  if (error) {
    console.error(`Audit log: could not record ${event}: ${error.message}`);
  }
}
