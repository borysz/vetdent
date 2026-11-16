import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { PushResult, PushStatus, ServerClient, WireChange } from "./clients-model";
import { SyncError, type SyncApi, type SyncErrorKind } from "./sync-engine";

const PUSH_STATUSES: readonly PushStatus[] = ["applied", "unchanged", "invalid", "forbidden", "deleted"];

function kindOf(error: { message?: string; code?: string | null; status?: number }): SyncErrorKind {
  const message = error.message ?? "";
  if (message === "read_only") return "read_only";
  if (message === "forbidden") return "forbidden";
  if (message === "not_authenticated" || error.status === 401) return "unauthenticated";
  if (message === "mfa_required") return "mfa_required";
  // fetch() rejects with a TypeError when the network is unreachable.
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) return "offline";
  return "unknown";
}

function parsePushResults(value: unknown): PushResult[] {
  if (!Array.isArray(value)) throw new SyncError("unknown", "Unexpected answer from the server");

  return value.flatMap((entry) => {
    if (entry === null || typeof entry !== "object") return [];
    const { id, status, rev } = entry as { id?: unknown; status?: unknown; rev?: unknown };
    if (typeof id !== "string" || typeof status !== "string") return [];
    if (!(PUSH_STATUSES as readonly string[]).includes(status)) return [];
    return [{ id, status: status as PushStatus, rev: typeof rev === "number" ? rev : undefined }];
  });
}

/** The real network: the Supabase client, acting as the signed-in user (so row level security applies). */
export function createSupabaseSyncApi(supabase: SupabaseClient<Database>, organizationId: string): SyncApi {
  return {
    async pushClients(changes: WireChange[]): Promise<PushResult[]> {
      const { data, error } = await supabase.rpc("sync_push_clients", {
        p_organization_id: organizationId,
        p_changes: changes as never,
      });
      if (error) throw new SyncError(kindOf(error), error.message);
      return parsePushResults(data);
    },

    async pullClients(afterSeq: number, limit: number): Promise<ServerClient[]> {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, phone, email, address, notes, email_consent, rev, seq, deleted_at, updated_at")
        .eq("organization_id", organizationId)
        .gt("seq", afterSeq)
        .order("seq", { ascending: true })
        .limit(limit);
      if (error) throw new SyncError(kindOf(error), error.message);

      return data.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        phone: row.phone,
        email: row.email,
        address: row.address,
        notes: row.notes,
        emailConsent: row.email_consent,
        rev: row.rev,
        seq: row.seq,
        deletedAt: row.deleted_at,
        updatedAt: row.updated_at,
      }));
    },
  };
}
