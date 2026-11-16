import { fitsSpecies } from "@/domain/dental/template";
import type { Species } from "@/domain/teeth/catalog";
import { normalizeForSearch } from "./clients-store";
import type { LocalDatabase } from "./local-db";
import { isDeleted } from "./record-model";
import { templateOps, type TemplateFields, type TemplateKind, type TemplateView } from "./templates-model";

/**
 * Reading and writing templates on the device. Every write is local and
 * immediate; the sync engine sends it when it can (and the database decides
 * who may change what).
 */

export interface TemplateFilter {
  kind?: TemplateKind;
  /** Only templates meant for this species (or for both). */
  species?: Species;
  /** Text templates for this field of the visit, or for any field. */
  textTarget?: string;
}

/** The templates that are not deleted, by name; the organization's first, then the user's own. */
export async function listTemplates(db: LocalDatabase, organizationId: string, filter: TemplateFilter = {}): Promise<TemplateView[]> {
  const rows = await db.templates.where("organizationId").equals(organizationId).toArray();
  return rows
    .filter((row) => !isDeleted(row))
    .map((row) => templateOps.viewOf(row))
    .filter((view) => (filter.kind ? view.kind === filter.kind : true))
    .filter((view) => (filter.species ? fitsSpecies(view.species, filter.species) : true))
    .filter((view) => (filter.textTarget ? view.textTarget === null || view.textTarget === filter.textTarget : true))
    .sort((a, b) => Number(b.shared) - Number(a.shared) || normalizeForSearch(a.name).localeCompare(normalizeForSearch(b.name), "hu"));
}

export async function getTemplate(db: LocalDatabase, id: string): Promise<TemplateView | null> {
  const row = await db.templates.get(id);
  return row && !isDeleted(row) ? templateOps.viewOf(row) : null;
}

export async function createTemplate(
  db: LocalDatabase,
  organizationId: string,
  fields: TemplateFields,
  id: string = crypto.randomUUID(),
): Promise<string> {
  await db.templates.put(templateOps.newLocal(id, organizationId, fields, Date.now()));
  return id;
}

/** The kind of a template is fixed once it exists, so it is never part of an edit. */
export async function updateTemplate(db: LocalDatabase, id: string, fields: Partial<Omit<TemplateFields, "kind">>): Promise<void> {
  await db.transaction("rw", db.templates, async () => {
    const row = await db.templates.get(id);
    if (row) await db.templates.put(templateOps.editLocal(row, fields, Date.now()));
  });
}

export async function removeTemplate(db: LocalDatabase, id: string): Promise<void> {
  await db.transaction("rw", db.templates, async () => {
    const row = await db.templates.get(id);
    if (!row) return;
    const next = templateOps.deleteLocal(row, Date.now());
    if (next === null) await db.templates.delete(id);
    else await db.templates.put(next);
  });
}
