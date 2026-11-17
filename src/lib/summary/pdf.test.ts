import { describe, expect, test } from "vitest";
import messages from "../../../messages/hu.json";
import { EMPTY_MARKS, withFinding, withProcedure, type ToothMarks } from "@/domain/dental/chart";
import { buildSummary, type SummaryInput, type Translate } from "@/domain/summary/summary";
import { renderSummaryPdf } from "./pdf";

const t: Translate = (key, values = {}) => {
  let node: unknown = messages;
  for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
  if (typeof node !== "string") throw new Error(`missing text: ${key}`);
  return node.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
};

const chartOf = (...entries: [number, ToothMarks][]) => new Map(entries);

const input = (overrides: Partial<SummaryInput> = {}): SummaryInput => ({
  species: "dog",
  organization: { name: "Őri Állatorvosi Rendelő", address: "1011 Budapest, Fő utca 1.", phone: null, email: null },
  ownerName: "Kovács Anna",
  patient: { name: "Bodri", breed: "keverék", birthDate: "2020-05-17", neutered: true, weightKg: 18.5 },
  visit: {
    date: "2026-11-16",
    veterinarianName: "Dr. Kiss",
    weightKg: null,
    status: "final",
    followUpDate: "2026-11-28",
    feedingAdvice: "Három napig puha táp.",
    sutures: "Felszívódó öltés",
    medications: [{ name: "Meloxicam", dose: "0,1 mg/kg", frequency: "naponta egyszer", duration: "5 nap" }],
  },
  chart: chartOf(
    [104, withFinding(EMPTY_MARKS, "T", "2")],
    [108, withProcedure(EMPTY_MARKS, "EXT", "S", "done")],
    [204, withFinding(EMPTY_MARKS, "M", "missing")],
  ),
  photos: [],
  ...overrides,
});

const render = (overrides: Partial<SummaryInput> = {}, images?: Map<string, Uint8Array>) =>
  renderSummaryPdf(buildSummary(input(overrides), t), { compress: false, images });

const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

describe("the PDF", () => {
  test("is a PDF file with the Hungarian letters", async () => {
    const pdf = await render();
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("DejaVuSans");
    // The text map lists every character that was drawn: ő (0151) and ű (0171) are among them.
    expect(text).toMatch(/<[0-9a-f]{4}> <0151>/i);
    expect(text).toMatch(/<[0-9a-f]{4}> <0171>/i);
  });

  test("never reads the built-in fonts, which would be missing from a build", async () => {
    expect((await render()).toString("latin1")).not.toContain("Helvetica");
  });

  test("a long summary goes onto more pages", async () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ name: `Gyógyszer ${index}`, dose: "1 tabletta", frequency: "naponta", duration: "5 nap" }));
    const short = await render();
    const long = await render({ visit: { ...input().visit, medications: many } });
    expect(pages(long)).toBeGreaterThan(pages(short));
  });

  test("a photo that is not an image is left out instead of failing", async () => {
    const photos = [{ id: "a", kind: "other" as const, tooth: null, quadrant: null }];
    const pdf = await render({ photos }, new Map([["a", new Uint8Array([1, 2, 3])]]));
    expect(pdf.toString("latin1").startsWith("%PDF-")).toBe(true);
  });

  test("a cat's chart can be drawn too", async () => {
    expect((await render({ species: "cat", chart: new Map() })).length).toBeGreaterThan(1000);
  });
});
