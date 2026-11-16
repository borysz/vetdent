import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { PushResult, PushStatus, ServerClient, WireChange } from "./clients-model";
import type { ServerPatient } from "./patients-model";
import { SyncError, type SyncApi, type SyncErrorKind } from "./sync-engine";
import { parseFindings, parsePockets, parseProcedures, serializeFindings, serializePockets, serializeProcedures } from "@/domain/dental/chart";
import { parsePayload, serializePayload } from "@/domain/dental/template";
import { serializeBlocks, serializeMedications, serializeTags } from "./visit-lists";
import type { ServerTemplate } from "./templates-model";
import type { ServerTooth } from "./teeth-model";
import type { ServerVisit } from "./visits-model";

const asStrings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
const asObjects = (value: unknown): Record<string, string>[] =>
  Array.isArray(value) ? value.filter((v): v is Record<string, string> => v !== null && typeof v === "object") : [];

const PUSH_STATUSES: readonly PushStatus[] = ["applied", "unchanged", "invalid", "forbidden", "deleted", "locked"];

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

    async pushPatients(changes: WireChange[]): Promise<PushResult[]> {
      const { data, error } = await supabase.rpc("sync_push_patients", {
        p_organization_id: organizationId,
        p_changes: changes as never,
      });
      if (error) throw new SyncError(kindOf(error), error.message);
      return parsePushResults(data);
    },

    async pullPatients(afterSeq: number, limit: number): Promise<ServerPatient[]> {
      const { data, error } = await supabase
        .from("patients")
        .select(
          "id, client_id, name, species, breed, birth_date, sex, neutered, weight_kg, microchip, notes, rev, seq, deleted_at, updated_at",
        )
        .eq("organization_id", organizationId)
        .gt("seq", afterSeq)
        .order("seq", { ascending: true })
        .limit(limit);
      if (error) throw new SyncError(kindOf(error), error.message);

      return data.map((row) => ({
        id: row.id,
        clientId: row.client_id,
        name: row.name,
        species: row.species,
        breed: row.breed,
        birthDate: row.birth_date,
        sex: row.sex,
        neutered: row.neutered,
        weightKg: row.weight_kg,
        microchip: row.microchip,
        notes: row.notes,
        rev: row.rev,
        seq: row.seq,
        deletedAt: row.deleted_at,
        updatedAt: row.updated_at,
      }));
    },

    async pushVisits(changes: WireChange[]): Promise<PushResult[]> {
      const { data, error } = await supabase.rpc("sync_push_visits", {
        p_organization_id: organizationId,
        p_changes: changes as never,
      });
      if (error) throw new SyncError(kindOf(error), error.message);
      return parsePushResults(data);
    },

    async pullVisits(afterSeq: number, limit: number): Promise<ServerVisit[]> {
      const { data, error } = await supabase
        .from("visits")
        .select(
          "id, patient_id, visit_date, veterinarian_name, assistant_name, asa_status, last_fed_at, blood_summary, weight_kg, complaint_tags, complaint_notes, home_brushing, diet_type, anesthesia_blocks, sutures, medications, feeding_advice, follow_up_date, ready_to_finalize, general_note, status, finalized_at, rev, seq, deleted_at, updated_at",
        )
        .eq("organization_id", organizationId)
        .gt("seq", afterSeq)
        .order("seq", { ascending: true })
        .limit(limit);
      if (error) throw new SyncError(kindOf(error), error.message);

      return data.map((row) => ({
        id: row.id,
        patientId: row.patient_id,
        visitDate: row.visit_date,
        veterinarianName: row.veterinarian_name,
        assistantName: row.assistant_name,
        asaStatus: row.asa_status,
        lastFedAt: row.last_fed_at,
        bloodSummary: row.blood_summary,
        weightKg: row.weight_kg,
        complaintTags: serializeTags(asStrings(row.complaint_tags)),
        complaintNotes: row.complaint_notes,
        homeBrushing: row.home_brushing,
        dietType: row.diet_type,
        anesthesiaBlocks: serializeBlocks(asObjects(row.anesthesia_blocks)),
        sutures: row.sutures,
        medications: serializeMedications(asObjects(row.medications)),
        feedingAdvice: row.feeding_advice,
        followUpDate: row.follow_up_date,
        readyToFinalize: row.ready_to_finalize,
        generalNote: row.general_note,
        status: row.status,
        finalizedAt: row.finalized_at,
        rev: row.rev,
        seq: row.seq,
        deletedAt: row.deleted_at,
        updatedAt: row.updated_at,
      }));
    },

    async pushTemplates(changes: WireChange[]): Promise<PushResult[]> {
      const { data, error } = await supabase.rpc("sync_push_templates", {
        p_organization_id: organizationId,
        p_changes: changes as never,
      });
      if (error) throw new SyncError(kindOf(error), error.message);
      return parsePushResults(data);
    },

    async pullTemplates(afterSeq: number, limit: number): Promise<ServerTemplate[]> {
      const { data, error } = await supabase
        .from("templates")
        .select("id, kind, name, shared, species, text_target, body, payload, rev, seq, deleted_at, updated_at")
        .eq("organization_id", organizationId)
        .gt("seq", afterSeq)
        .order("seq", { ascending: true })
        .limit(limit);
      if (error) throw new SyncError(kindOf(error), error.message);

      return data.map((row) => ({
        id: row.id,
        kind: row.kind,
        name: row.name,
        shared: row.shared,
        species: row.species,
        textTarget: row.text_target,
        body: row.body,
        payload: row.payload === null ? null : serializePayload(parsePayload(row.payload)),
        rev: row.rev,
        seq: row.seq,
        deletedAt: row.deleted_at,
        updatedAt: row.updated_at,
      }));
    },

    async pushTeeth(changes: WireChange[]): Promise<PushResult[]> {
      const { data, error } = await supabase.rpc("sync_push_visit_teeth", {
        p_organization_id: organizationId,
        p_changes: changes as never,
      });
      if (error) throw new SyncError(kindOf(error), error.message);
      return parsePushResults(data);
    },

    async pullTeeth(afterSeq: number, limit: number): Promise<ServerTooth[]> {
      const { data, error } = await supabase
        .from("visit_teeth")
        .select("id, visit_id, tooth, findings, procedures, pockets, note, rev, seq, deleted_at, updated_at")
        .eq("organization_id", organizationId)
        .gt("seq", afterSeq)
        .order("seq", { ascending: true })
        .limit(limit);
      if (error) throw new SyncError(kindOf(error), error.message);

      return data.map((row) => ({
        id: row.id,
        visitId: row.visit_id,
        tooth: row.tooth,
        findings: serializeFindings(parseFindings(row.findings)),
        procedures: serializeProcedures(parseProcedures(row.procedures)),
        pockets: serializePockets(parsePockets(row.pockets)),
        note: row.note,
        rev: row.rev,
        seq: row.seq,
        deletedAt: row.deleted_at,
        updatedAt: row.updated_at,
      }));
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
