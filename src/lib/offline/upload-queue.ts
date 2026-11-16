import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { storagePath } from "./attachments-model";
import { markFileProblem, markFileUploaded, pendingUploads, releaseConfirmedFiles } from "./attachments-store";
import type { LocalDatabase } from "./local-db";

/**
 * The upload queue: photos made on the device go to the storage bucket one by
 * one, oldest first, whenever there is a connection. A photo made offline is
 * therefore uploaded when the connection returns, without anyone doing
 * anything, and a round that is interrupted continues with the next file.
 */

export interface UploadOutcome {
  uploaded: number;
  /** Refused by the server (allowance used up, or not allowed); they wait for a retry. */
  refused: number;
  /** The connection failed; the rest stays queued. */
  offline: boolean;
}

function looksOffline(error: { message?: string; statusCode?: string | number }): boolean {
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(error.message ?? "");
}

/** Why an upload was refused: the allowance, or something else. */
async function whyRefused(supabase: SupabaseClient<Database>, organizationId: string): Promise<"quota" | "denied"> {
  const { data } = await supabase.rpc("my_storage_usage", { p_organization_id: organizationId });
  const usage = data?.[0];
  return usage && Number(usage.used_bytes) >= Number(usage.limit_bytes) ? "quota" : "denied";
}

export async function uploadPendingFiles(
  db: LocalDatabase,
  supabase: SupabaseClient<Database>,
  organizationId: string,
): Promise<UploadOutcome> {
  const outcome: UploadOutcome = { uploaded: 0, refused: 0, offline: false };

  for (const file of await pendingUploads(db)) {
    if (file.blob === null || file.organizationId !== organizationId) continue;
    let error: { message?: string; statusCode?: string | number } | null = null;
    try {
      ({ error } = await supabase.storage
        .from("attachments")
        .upload(storagePath(organizationId, file.id), file.blob, { contentType: file.type, upsert: true }));
    } catch (thrown) {
      error = { message: thrown instanceof Error ? thrown.message : String(thrown) };
    }

    if (!error) {
      await markFileUploaded(db, file.id);
      outcome.uploaded += 1;
    } else if (looksOffline(error)) {
      outcome.offline = true;
      break;
    } else if (String(error.statusCode) === "403" || String(error.statusCode) === "401" || /row-level security|unauthorized|permission/i.test(error.message ?? "")) {
      await markFileProblem(db, file.id, await whyRefused(supabase, organizationId));
      outcome.refused += 1;
    }
    // Any other failure leaves the file queued for the next round.
  }

  await releaseConfirmedFiles(db);
  return outcome;
}
