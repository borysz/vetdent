import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/database.types";
import { clientPath, patientPath, routes, visitPath } from "@/lib/routes";
import { isConflictTable, type ConflictTable } from "./conflicts";

type Client = SupabaseClient<Database>;

export const MAX_SHOWN_CONFLICTS = 200;

export interface OpenConflict {
  id: number;
  table: ConflictTable;
  field: string;
  /** The value that stands. */
  kept: Json;
  /** The value that did not get in (or was replaced). */
  lost: Json;
  /** Who wrote the value that did not get in. */
  byName: string | null;
  createdAt: string;
  /** What record it is: the animal's or owner's name, the template's name, … */
  title: string | null;
  /** A detail of the record: the visit's date, the tooth, the kind of file. */
  detail: string | null;
  /** Where the record can be opened; `null` if it can not be reached any more. */
  href: string | null;
}

/** How many conflicts wait for a decision (for the navigation). */
export async function countOpenConflicts(supabase: Client, organizationId: string): Promise<number> {
  const { count } = await supabase
    .from("sync_conflicts")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("resolved_at", null);
  return count ?? 0;
}

interface Named {
  title: string | null;
  detail: string | null;
  href: string | null;
}

/** The open conflicts of the organization, newest first, each with the record it concerns. */
export async function loadOpenConflicts(supabase: Client, organizationId: string): Promise<OpenConflict[]> {
  const { data: rows, error } = await supabase
    .from("sync_conflicts")
    .select("id, table_name, record_id, field, overwritten_value, applied_value, overwritten_by, created_at")
    .eq("organization_id", organizationId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_SHOWN_CONFLICTS);
  if (error) throw new Error(`Could not load the conflicts: ${error.message}`);

  const idsOf = (table: ConflictTable) => [...new Set(rows.filter((row) => row.table_name === table).map((row) => row.record_id))];
  const named = new Map<string, Named>();
  const key = (table: ConflictTable, id: string) => `${table}:${id}`;

  const [clients, patients, visits, teeth, templates, attachments] = await Promise.all([
    idsOf("clients").length ? supabase.from("clients").select("id, full_name").in("id", idsOf("clients")) : null,
    idsOf("patients").length ? supabase.from("patients").select("id, name").in("id", idsOf("patients")) : null,
    idsOf("visits").length ? supabase.from("visits").select("id, visit_date, patient_id").in("id", idsOf("visits")) : null,
    idsOf("visit_teeth").length ? supabase.from("visit_teeth").select("id, tooth, visit_id").in("id", idsOf("visit_teeth")) : null,
    idsOf("templates").length ? supabase.from("templates").select("id, name").in("id", idsOf("templates")) : null,
    idsOf("attachments").length ? supabase.from("attachments").select("id, kind, visit_id").in("id", idsOf("attachments")) : null,
  ]);

  for (const row of clients?.data ?? []) named.set(key("clients", row.id), { title: row.full_name, detail: null, href: clientPath(row.id) });
  for (const row of templates?.data ?? []) named.set(key("templates", row.id), { title: row.name, detail: null, href: routes.templates });

  // Visits, teeth and files are named after the animal of their visit.
  const visitIds = new Set<string>([...(teeth?.data ?? []).map((row) => row.visit_id), ...(attachments?.data ?? []).map((row) => row.visit_id)]);
  const extraVisits = visitIds.size ? ((await supabase.from("visits").select("id, visit_date, patient_id").in("id", [...visitIds])).data ?? []) : [];
  const visitById = new Map([...(visits?.data ?? []), ...extraVisits].map((visit) => [visit.id, visit]));
  const patientIds = new Set<string>([...visitById.values()].map((visit) => visit.patient_id));
  for (const row of patients?.data ?? []) patientIds.add(row.id);
  const patientRows = patientIds.size ? ((await supabase.from("patients").select("id, name").in("id", [...patientIds])).data ?? []) : [];
  const patientName = new Map(patientRows.map((patient) => [patient.id, patient.name]));

  for (const row of patients?.data ?? []) named.set(key("patients", row.id), { title: row.name, detail: null, href: patientPath(row.id) });
  for (const row of visits?.data ?? []) {
    named.set(key("visits", row.id), { title: patientName.get(row.patient_id) ?? null, detail: row.visit_date, href: visitPath(row.id) });
  }
  for (const row of teeth?.data ?? []) {
    const visit = visitById.get(row.visit_id);
    named.set(key("visit_teeth", row.id), {
      title: visit ? (patientName.get(visit.patient_id) ?? null) : null,
      detail: String(row.tooth),
      href: visitPath(row.visit_id),
    });
  }
  for (const row of attachments?.data ?? []) {
    const visit = visitById.get(row.visit_id);
    named.set(key("attachments", row.id), {
      title: visit ? (patientName.get(visit.patient_id) ?? null) : null,
      detail: row.kind,
      href: visitPath(row.visit_id),
    });
  }

  // Who wrote the value that did not get in (colleagues' names are readable).
  const authorIds = [...new Set(rows.map((row) => row.overwritten_by).filter((id): id is string => id !== null))];
  const authors = authorIds.length ? ((await supabase.from("profiles").select("id, full_name").in("id", authorIds)).data ?? []) : [];
  const authorName = new Map(authors.map((author) => [author.id, author.full_name]));

  return rows.flatMap((row) => {
    if (!isConflictTable(row.table_name)) return [];
    const record = named.get(key(row.table_name, row.record_id));
    return [
      {
        id: row.id,
        table: row.table_name,
        field: row.field,
        kept: row.applied_value,
        lost: row.overwritten_value,
        // A person who has not filled in their name has an empty one: shown as unknown.
        byName: (row.overwritten_by ? authorName.get(row.overwritten_by) : null) || null,
        createdAt: row.created_at,
        title: record?.title ?? null,
        detail: record?.detail ?? null,
        href: record?.href ?? null,
      },
    ];
  });
}
