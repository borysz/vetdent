import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Finalising and reopening a visit. Both are events the server decides and
 * records, so they only work online and are never queued on the device.
 */

/** Translation keys under `visits.lifecycleErrors`. */
export type LifecycleError =
  | "offline"
  | "forbidden"
  | "read_only"
  | "visit_not_found"
  | "already_final"
  | "not_final"
  | "missing_required"
  | "reason_required"
  | "unknown";

export type LifecycleResult = { ok: true } | { ok: false; error: LifecycleError };

const KNOWN: readonly LifecycleError[] = [
  "forbidden",
  "read_only",
  "visit_not_found",
  "already_final",
  "not_final",
  "missing_required",
  "reason_required",
];

function toError(error: { message?: string }): LifecycleError {
  const message = error.message ?? "";
  const known = KNOWN.find((kind) => message === kind);
  if (known) return known;
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) return "offline";
  return "unknown";
}

export async function finalizeVisit(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  visitId: string,
): Promise<LifecycleResult> {
  try {
    const { error } = await supabase.rpc("finalize_visit", { p_organization_id: organizationId, p_visit_id: visitId });
    return error ? { ok: false, error: toError(error) } : { ok: true };
  } catch {
    return { ok: false, error: "offline" };
  }
}

export async function reopenVisit(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  visitId: string,
  reason: string,
): Promise<LifecycleResult> {
  try {
    const { error } = await supabase.rpc("reopen_visit", {
      p_organization_id: organizationId,
      p_visit_id: visitId,
      p_reason: reason,
    });
    return error ? { ok: false, error: toError(error) } : { ok: true };
  } catch {
    return { ok: false, error: "offline" };
  }
}
