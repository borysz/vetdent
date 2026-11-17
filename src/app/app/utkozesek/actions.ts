"use server";

import { refresh } from "next/cache";
import { requirePermission } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Marks a conflict as dealt with. A conflict someone else already closed is not an error. */
export async function resolveConflictAction(formData: FormData): Promise<void> {
  await requirePermission("clients.write");
  const id = Number(formData.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("resolve_sync_conflict", { p_conflict_id: id });
  if (error && !error.message.includes("conflict_not_found")) throw new Error(`Could not resolve the conflict: ${error.message}`);
  refresh();
}
