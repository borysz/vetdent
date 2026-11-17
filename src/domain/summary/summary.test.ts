import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import messages from "../../../messages/hu.json";
import { CODES } from "@/domain/dental/codes";
import { EMPTY_MARKS, withFinding, withProcedure, type ToothMarks } from "@/domain/dental/chart";
import { TOOTH_COLOR_HEX } from "@/domain/dental/tooth-geometry";
import { buildSummary, formatDate, type Block, type SummaryInput, type Translate } from "./summary";

/** The real Hungarian texts, so a missing text fails here; placeholders ({name}) are filled in. */
const t: Translate = (key, values = {}) => {
  let node: unknown = messages;
  for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
  if (typeof node !== "string") throw new Error(`missing text: ${key}`);
  return node.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
};

const marks = (...parts: ((current: ToothMarks) => ToothMarks)[]): ToothMarks => parts.reduce((current, part) => part(current), EMPTY_MARKS);
const finding = (code: Parameters<typeof withFinding>[1], level: string) => (m: ToothMarks) => withFinding(m, code, level);
const procedure = (code: Parameters<typeof withProcedure>[1], level: string, state: "planned" | "done") => (m: ToothMarks) => withProcedure(m, code, level, state);

const input = (overrides: Partial<SummaryInput> = {}): SummaryInput => ({
  species: "dog",
  organization: { name: "Bocskai Állatorvosi Rendelő", address: "1011 Budapest, Fő utca 1.", phone: "+36 1 234 5678", email: "info@example.hu" },
  ownerName: "Kovács Anna",
  patient: { name: "Bodri", breed: "keverék", birthDate: "2020-05-17", neutered: true, weightKg: 18.5 },
  visit: { date: "2026-11-16", veterinarianName: "Dr. Kiss", weightKg: null, status: "final", followUpDate: "2026-11-28", feedingAdvice: "Három napig puha táp.", sutures: null, medications: [] },
  chart: new Map(),
  photos: [],
  ...overrides,
});

const blocksOf = (type: Block["type"], blocks: Block[]) => blocks.filter((block) => block.type === type);
const text = (blocks: Block[]) => JSON.stringify(blocks);

describe("the texts", () => {
  test("every code has a plain-language explanation", () => {
    for (const { code } of CODES) expect(() => t(`summary.lay.${code}`), code).not.toThrow();
  });

  test("a date is written the Hungarian way", () => {
    expect(formatDate("2026-11-16")).toBe("2026. 11. 16.");
    expect(formatDate("nonsense")).toBe("nonsense");
  });
});

describe("the colours of the PDF", () => {
  test("are the colour tokens of the stylesheet", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const token = (name: string) => new RegExp(`--color-tooth-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1]?.toLowerCase();
    expect(TOOTH_COLOR_HEX.green).toBe(token("healthy"));
    expect(TOOTH_COLOR_HEX.yellow).toBe(token("tartar"));
    expect(TOOTH_COLOR_HEX.orange).toBe(token("inflamed"));
    expect(TOOTH_COLOR_HEX.red).toBe(token("extract"));
    expect(TOOTH_COLOR_HEX.blue).toBe(token("endo"));
  });
});

describe("the summary of a visit", () => {
  test("starts with the practice and the title, and tells who and when", () => {
    const { blocks } = buildSummary(input(), t);
    expect(blocks[0]).toMatchObject({ type: "organization", name: "Bocskai Állatorvosi Rendelő", lines: ["1011 Budapest, Fő utca 1.", "+36 1 234 5678", "info@example.hu"] });
    expect(blocks[1]).toMatchObject({ type: "title", text: "Fogászati kezelés összefoglalója", subtitle: "2026. 11. 16." });
    const facts = blocksOf("facts", blocks)[0] as Extract<Block, { type: "facts" }>;
    expect(Object.fromEntries(facts.rows.map((row) => [row.label, row.value]))).toMatchObject({
      "Az állat neve": "Bodri",
      Gazdi: "Kovács Anna",
      Faj: "Kutya",
      Kor: "6 év 5 hónap",
      Ivartalanított: "igen",
      Testtömeg: "18.5 kg",
      Kezelőorvos: "Dr. Kiss",
    });
  });

  test("a visit that is not final says so", () => {
    expect(text(buildSummary(input({ visit: { ...input().visit, status: "draft" } }), t).blocks)).toContain("még nem lezárt");
    expect(text(buildSummary(input(), t).blocks)).not.toContain("még nem lezárt");
  });

  test("the chart shows the whole dentition in four rows, with colours and badges", () => {
    const chart = new Map<number, ToothMarks>([[104, marks(finding("T", "2"), procedure("U", "", "done"))], [406, marks(finding("M", "missing"))]]);
    const block = blocksOf("chart", buildSummary(input({ chart }), t).blocks)[0] as Extract<Block, { type: "chart" }>;
    expect(block.jaws.map((jaw) => jaw.rows.length)).toEqual([2, 2]);
    const teeth = block.jaws.flatMap((jaw) => jaw.rows.flatMap((row) => row.teeth));
    expect(teeth).toHaveLength(42);
    expect(teeth.find((tooth) => tooth.number === 104)).toMatchObject({ color: "yellow", badges: ["T2", "U"] });
    expect(teeth.find((tooth) => tooth.number === 406)).toMatchObject({ color: "gray", badges: ["M"] });
    expect(teeth.find((tooth) => tooth.number === 101)).toMatchObject({ color: "none", badges: [] });
    expect(block.legend).toHaveLength(6);
  });

  test("the same procedure on several teeth is one entry, with a plain explanation; planned ones come separately", () => {
    const cleaning = marks(procedure("U", "", "done"), procedure("POL", "", "done"));
    const chart = new Map<number, ToothMarks>([
      [304, cleaning],
      [104, cleaning],
      [208, marks(procedure("EXT", "S", "planned"))],
    ]);
    const { blocks } = buildSummary(input({ chart }), t);
    const lists = blocksOf("list", blocks) as Extract<Block, { type: "list" }>[];
    const done = lists[0].items;
    expect(done.map((item) => [item.teeth, item.name])).toEqual([
      ["104, 304", "Ultrahangos fogkő-eltávolítás"],
      ["104, 304", "Polírozás"],
    ]);
    expect(done[0].explanation).toContain("ultrahanggal");
    expect(lists[1].items[0]).toMatchObject({ teeth: "208", name: "Fogeltávolítás", detail: "EXT-S egyszerű, zárt" });
    expect(text(blocks)).toContain("Tervezett kezelések");
  });

  test("findings are listed with the teeth; healthy and missing teeth are told in a sentence", () => {
    const chart = new Map<number, ToothMarks>([
      [108, marks(finding("PD", "3"))],
      [109, marks(finding("PD", "3"))],
      [101, marks(finding("0", ""))],
      [102, marks(finding("0", ""))],
      [406, marks(finding("M", "missing"))],
    ]);
    const { blocks } = buildSummary(input({ chart }), t);
    const findings = (blocksOf("list", blocks) as Extract<Block, { type: "list" }>[])[0].items;
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ teeth: "108, 109", name: "Parodontális betegség", detail: "PD3 4–6 mm" });
    expect(text(blocks)).toContain("Egészséges fogak: 101, 102.");
    expect(text(blocks)).toContain("Hiányzó fogak: 406.");
  });

  test("with nothing recorded the summary says so instead of showing empty lists", () => {
    const { blocks } = buildSummary(input(), t);
    expect(text(blocks)).toContain("beavatkozás nem történt");
    expect(text(blocks)).toContain("Nem rögzítettünk eltérést");
    expect(blocksOf("list", blocks)).toHaveLength(0);
  });

  test("medicines, feeding advice, stitches and the check-up date", () => {
    const { blocks } = buildSummary(
      input({
        visit: {
          ...input().visit,
          sutures: "6-0 felszívódó",
          medications: [
            { name: "Meloxicam", dose: "0,1 mg/kg", frequency: "naponta", duration: "5 nap" },
            { name: "", dose: "ignored", frequency: "", duration: "" },
          ],
        },
      }),
      t,
    );
    const table = blocksOf("table", blocks)[0] as Extract<Block, { type: "table" }>;
    expect(table.columns).toEqual(["Készítmény", "Adag", "Gyakoriság", "Időtartam"]);
    expect(table.rows).toEqual([["Meloxicam", "0,1 mg/kg", "naponta", "5 nap"]]);
    expect(text(blocks)).toContain("Három napig puha táp.");
    expect(text(blocks)).toContain("Varratok: 6-0 felszívódó");
    expect((blocksOf("highlight", blocks)[0] as Extract<Block, { type: "highlight" }>).text).toBe("Kontroll időpontja: 2026. 11. 28.");
  });

  test("before and after photos of the same place are a pair; the others stand alone", () => {
    const { blocks } = buildSummary(
      input({
        photos: [
          { id: "b1", kind: "before", tooth: 104, quadrant: null },
          { id: "a1", kind: "after", tooth: 104, quadrant: null },
          { id: "b2", kind: "before", tooth: 204, quadrant: null },
          { id: "x1", kind: "xray", tooth: null, quadrant: 3 },
        ],
      }),
      t,
    );
    const photos = blocksOf("photos", blocks)[0] as Extract<Block, { type: "photos" }>;
    expect(photos.pairs).toEqual([{ place: "104 fog", before: { id: "b1", caption: "Előtte" }, after: { id: "a1", caption: "Utána" } }]);
    expect(photos.singles.map((single) => [single.id, single.place, single.caption])).toEqual([
      ["b2", "204 fog", "Előtte"],
      ["x1", "3. kvadráns", "Röntgen"],
    ]);
  });

  test("a visit without photos has no photo section", () => {
    expect(blocksOf("photos", buildSummary(input(), t).blocks)).toHaveLength(0);
  });

  test("the last block is the footer with the practice's name", () => {
    const blocks = buildSummary(input(), t).blocks;
    expect(blocks[blocks.length - 1]).toMatchObject({ type: "footer" });
    expect(text(blocks.slice(-1))).toContain("Bocskai Állatorvosi Rendelő");
  });
});
