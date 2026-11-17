import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseFindings, parseProcedures, type ToothMarks } from "@/domain/dental/chart";
import type { SummaryInput, SummaryPhotoInput } from "@/domain/summary/summary";
import { parseMedications } from "@/lib/offline/visit-lists";
import { storagePath } from "@/lib/offline/attachments-model";
import type { Database } from "@/lib/supabase/database.types";
import { formatAddress, type OrganizationContact } from "./organization";

type Client = SupabaseClient<Database>;

/** The practice's name and contact details (a member may read their own practice). */
export async function loadOrganizationContact(supabase: Client, organizationId: string): Promise<OrganizationContact | null> {
  const { data } = await supabase
    .from("organizations")
    .select("name, address_line, postal_code, city, phone, email")
    .eq("id", organizationId)
    .maybeSingle();
  if (!data) return null;
  return {
    name: data.name,
    address: formatAddress({ postalCode: data.postal_code, city: data.city, addressLine: data.address_line }),
    phone: data.phone,
    email: data.email,
  };
}

export interface LoadedSummary {
  input: SummaryInput;
  /** The photos that can be put in a PDF, by attachment id. */
  photoIds: string[];
  organizationId: string;
}

/**
 * Everything the summary of a visit needs, read as the signed-in user (so row
 * level security decides what they may see). `null`: no such visit.
 */
export async function loadSummary(supabase: Client, visitId: string, photoIds: readonly string[]): Promise<LoadedSummary | null> {
  const { data: visit } = await supabase.from("visits").select("*").eq("id", visitId).is("deleted_at", null).maybeSingle();
  if (!visit) return null;

  const [{ data: patient }, organization, { data: teeth }, { data: attachments }] = await Promise.all([
    supabase.from("patients").select("*").eq("id", visit.patient_id).maybeSingle(),
    loadOrganizationContact(supabase, visit.organization_id),
    supabase.from("visit_teeth").select("tooth, findings, procedures").eq("visit_id", visit.id).is("deleted_at", null),
    photoIds.length > 0
      ? supabase.from("attachments").select("id, kind, tooth, quadrant, mime_type, uploaded").eq("visit_id", visit.id).is("deleted_at", null).in("id", [...photoIds])
      : Promise.resolve({ data: [] as { id: string; kind: SummaryPhotoInput["kind"]; tooth: number | null; quadrant: number | null; mime_type: string | null; uploaded: boolean }[] }),
  ]);
  if (!patient || !organization) return null;

  const { data: owner } = await supabase.from("clients").select("full_name").eq("id", patient.client_id).maybeSingle();

  const chart = new Map<number, ToothMarks>();
  for (const row of teeth ?? []) {
    chart.set(row.tooth, { findings: parseFindings(row.findings), procedures: parseProcedures(row.procedures) });
  }

  // Only photos the PDF can draw (JPEG and PNG), in the order they were asked for.
  const usable = (attachments ?? []).filter((item) => item.uploaded && (item.mime_type === "image/jpeg" || item.mime_type === "image/png"));
  const photos: SummaryPhotoInput[] = photoIds
    .map((id) => usable.find((item) => item.id === id))
    .filter((item): item is (typeof usable)[number] => item !== undefined)
    .map((item) => ({ id: item.id, kind: item.kind, tooth: item.tooth, quadrant: item.quadrant }));

  return {
    organizationId: visit.organization_id,
    photoIds: photos.map((photo) => photo.id),
    input: {
      species: patient.species,
      organization,
      ownerName: owner?.full_name ?? null,
      patient: { name: patient.name, breed: patient.breed, birthDate: patient.birth_date, neutered: patient.neutered, weightKg: patient.weight_kg },
      visit: {
        date: visit.visit_date,
        veterinarianName: visit.veterinarian_name,
        weightKg: visit.weight_kg,
        status: visit.status,
        followUpDate: visit.follow_up_date,
        feedingAdvice: visit.feeding_advice,
        sutures: visit.sutures,
        medications: parseMedications(visit.medications),
      },
      chart,
      photos,
    },
  };
}

/** The bytes of the photos from the private bucket (as the signed-in user; the storage rules apply). */
export async function downloadPhotos(supabase: Client, organizationId: string, photoIds: readonly string[]): Promise<Map<string, Uint8Array>> {
  const images = new Map<string, Uint8Array>();
  await Promise.all(
    photoIds.map(async (id) => {
      const { data } = await supabase.storage.from("attachments").download(storagePath(organizationId, id));
      if (data) images.set(id, new Uint8Array(await data.arrayBuffer()));
    }),
  );
  return images;
}
