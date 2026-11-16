import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { LocalDatabase } from "./local-db";
import { EMPTY_TEMPLATE_FIELDS, type TemplateFields } from "./templates-model";
import { createTemplate, getTemplate, listTemplates, removeTemplate, updateTemplate } from "./templates-store";

const ORG = "org-1";

let db: LocalDatabase;
let counter = 0;

beforeEach(() => {
  counter += 1;
  db = new LocalDatabase(`templates-test-${counter}`);
});

afterEach(async () => {
  db.close();
  await db.delete();
});

const text = (overrides: Partial<TemplateFields> = {}): TemplateFields => ({
  ...EMPTY_TEMPLATE_FIELDS,
  kind: "text",
  name: "Puha táp",
  body: "Három napig áztatott táp.",
  textTarget: "feeding_advice",
  ...overrides,
});

const treatment = (overrides: Partial<TemplateFields> = {}): TemplateFields => ({
  ...EMPTY_TEMPLATE_FIELDS,
  kind: "treatment",
  name: "Rutin fogtisztítás",
  payload: '{"teeth":[],"texts":{},"medications":[]}',
  ...overrides,
});

describe("the templates on the device", () => {
  test("the organization's shared templates come first, then the user's own, each by name", async () => {
    await createTemplate(db, ORG, text({ name: "Árvíztűrő" }));
    await createTemplate(db, ORG, text({ name: "Közös b", shared: true }));
    await createTemplate(db, ORG, text({ name: "Közös a", shared: true }));
    await createTemplate(db, ORG, text({ name: "Ábrahám" }));

    expect((await listTemplates(db, ORG)).map((template) => template.name)).toEqual(["Közös a", "Közös b", "Ábrahám", "Árvíztűrő"]);
  });

  test("can be narrowed by kind, species and the field a text is meant for", async () => {
    await createTemplate(db, ORG, text({ name: "Táplálás", textTarget: "feeding_advice" }));
    await createTemplate(db, ORG, text({ name: "Varrat", textTarget: "sutures" }));
    await createTemplate(db, ORG, text({ name: "Bármely", textTarget: null }));
    await createTemplate(db, ORG, text({ name: "Macskának", textTarget: "feeding_advice", species: "cat" }));
    await createTemplate(db, ORG, treatment({ name: "Kezelés" }));

    const names = async (filter: Parameters<typeof listTemplates>[2]) => (await listTemplates(db, ORG, filter)).map((t) => t.name).sort();
    expect(await names({ kind: "treatment" })).toEqual(["Kezelés"]);
    expect(await names({ kind: "text", textTarget: "feeding_advice", species: "dog" })).toEqual(["Bármely", "Táplálás"]);
    expect(await names({ kind: "text", textTarget: "feeding_advice", species: "cat" })).toEqual(["Bármely", "Macskának", "Táplálás"]);
    expect(await names({ kind: "text", textTarget: "sutures" })).toEqual(["Bármely", "Varrat"]);
  });

  test("the templates of another organization are not listed", async () => {
    await createTemplate(db, "org-2", text({ name: "Idegen" }));
    expect(await listTemplates(db, ORG)).toEqual([]);
  });

  test("an edit is kept at once (the kind is not editable: the type excludes it and the database refuses it)", async () => {
    const id = await createTemplate(db, ORG, text());
    await updateTemplate(db, id, { name: "Átnevezve", body: "Új szöveg." });
    expect(await getTemplate(db, id)).toMatchObject({ name: "Átnevezve", body: "Új szöveg.", kind: "text", hasPendingChanges: true });
  });

  test("a deleted template disappears from the list", async () => {
    const id = await createTemplate(db, ORG, text());
    await removeTemplate(db, id);
    expect(await listTemplates(db, ORG)).toEqual([]);
    expect(await getTemplate(db, id)).toBeNull();
  });
});
