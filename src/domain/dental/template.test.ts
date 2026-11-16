import { describe, expect, test } from "vitest";
import { EMPTY_MARKS, withFinding, withProcedure, type ToothMarks } from "./chart";
import {
  applyTemplate,
  fitsSpecies,
  groupMarks,
  parsePayload,
  payloadFromVisit,
  serializePayload,
} from "./template";

const cleaning = withProcedure(withProcedure(withFinding(EMPTY_MARKS, "T", "2"), "U", "", "done"), "POL", "", "done");
const extraction = withProcedure(EMPTY_MARKS, "EXT", "S", "planned");
const noMarks = (): ToothMarks => EMPTY_MARKS;

describe("the stored form of a template", () => {
  test("is canonical and survives a round trip", () => {
    const payload = payloadFromVisit({
      groups: groupMarks(new Map([[104, cleaning], [204, cleaning]])),
      selectable: new Set(),
      texts: { feeding_advice: " Puha táp. " },
      medications: [{ name: "Meloxicam", dose: "0,1 mg/kg", frequency: "naponta", duration: "5 nap" }],
    });
    const text = serializePayload(payload);
    expect(serializePayload(parsePayload(text))).toBe(text);

    // The teeth, the texts and the medications all survive: nothing is lost in the stored form.
    const back = parsePayload(text);
    expect(back.texts).toEqual({ feeding_advice: "Puha táp." });
    expect(back.teeth.map((entry) => entry.tooth)).toEqual([104, 204]);
    expect(back.teeth[0].marks.findings).toEqual([{ code: "T", level: "2" }]);
    expect(back.teeth[0].marks.procedures.map((procedure) => procedure.code)).toEqual(["U", "POL"]);
    expect(back.medications).toHaveLength(1);
  });

  test("a chosen-on-loading entry keeps its marks and has no tooth", () => {
    const text = serializePayload({ teeth: [{ tooth: null, marks: cleaning }], texts: {}, medications: [] });
    expect(parsePayload(text).teeth).toEqual([{ tooth: null, marks: cleaning }]);
  });

  test("garbage and empty entries are dropped", () => {
    expect(parsePayload("not json")).toEqual({ teeth: [], texts: {}, medications: [] });
    expect(parsePayload({ teeth: [{ tooth: 104, findings: [], procedures: [] }, 7, null], texts: { surprise: "x", sutures: "  " } })).toEqual({
      teeth: [],
      texts: {},
      medications: [],
    });
  });
});

describe("making a template from a visit", () => {
  test("teeth with identical marks form one group", () => {
    const groups = groupMarks(new Map([[304, cleaning], [104, cleaning], [208, extraction], [305, noMarks()]]));
    expect(groups.map((group) => group.teeth)).toEqual([[104, 304], [208]]);
  });

  test("a group is either kept on its teeth or applies to teeth chosen on loading", () => {
    const groups = groupMarks(new Map([[104, cleaning], [204, cleaning], [208, extraction]]));
    const payload = payloadFromVisit({ groups, selectable: new Set([groups[0].key]), texts: {}, medications: [] });
    expect(payload.teeth.map((entry) => entry.tooth)).toEqual([null, 208]);

    const fixed = payloadFromVisit({ groups, selectable: new Set(), texts: {}, medications: [] });
    expect(fixed.teeth.map((entry) => entry.tooth)).toEqual([104, 204, 208]);
  });
});

describe("loading a template", () => {
  const routine = parsePayload({
    teeth: [
      { tooth: null, findings: [{ code: "T", level: "2" }], procedures: [{ code: "U", level: "", state: "done" }] },
      { tooth: 104, findings: [], procedures: [{ code: "EXT", level: "S", state: "planned" }] },
    ],
  });

  test("fixed teeth get their marks, and the chosen teeth get the shared ones", () => {
    const outcome = applyTemplate(routine, "dog", [208, 209], noMarks);
    expect(outcome.needsSelection).toBe(false);
    expect([...outcome.changes.keys()].sort()).toEqual([104, 208, 209]);
    expect(outcome.changes.get(208)?.findings).toEqual([{ code: "T", level: "2" }]);
    expect(outcome.changes.get(104)?.procedures).toEqual([{ code: "EXT", level: "S", state: "planned" }]);
  });

  test("without a selection only the fixed teeth change, and the user is told a selection is missing", () => {
    const outcome = applyTemplate(routine, "dog", [], noMarks);
    expect(outcome.needsSelection).toBe(true);
    expect([...outcome.changes.keys()]).toEqual([104]);
  });

  test("marks that do not fit are skipped and counted, the rest is applied", () => {
    const withLesion = parsePayload({
      teeth: [{ tooth: null, findings: [{ code: "RES", level: "2" }, { code: "G", level: "1" }], procedures: [] }],
    });
    const dog = applyTemplate(withLesion, "dog", [108], noMarks);
    expect(dog.skipped).toEqual({ species: 1 });
    expect(dog.changes.get(108)?.findings).toEqual([{ code: "G", level: "1" }]);

    const cat = applyTemplate(withLesion, "cat", [108], noMarks);
    expect(cat.skipped).toEqual({});
    expect(cat.changes.get(108)?.findings).toHaveLength(2);
  });

  test("a tooth the species does not have is skipped; a missing tooth takes nothing", () => {
    const payload = parsePayload({ teeth: [{ tooth: 305, findings: [{ code: "T", level: "1" }], procedures: [] }] });
    expect(applyTemplate(payload, "cat", [], noMarks).skipped).toEqual({ invalid: 1 });

    const missing = withFinding(EMPTY_MARKS, "M", "missing");
    const onMissing = applyTemplate(routine, "dog", [208], () => missing);
    expect(onMissing.skipped.missing).toBeGreaterThan(0);
    expect(onMissing.changes.has(208)).toBe(false);
  });

  test("a tooth that would end up unchanged needs no write", () => {
    const already = withProcedure(withFinding(EMPTY_MARKS, "T", "2"), "U", "", "done");
    const outcome = applyTemplate(routine, "dog", [208], (tooth) => (tooth === 208 ? already : noMarks()));
    expect(outcome.changes.has(208)).toBe(false);
  });
});

describe("which species a template is for", () => {
  test("a template for no species fits both", () => {
    expect(fitsSpecies(null, "dog")).toBe(true);
    expect(fitsSpecies("cat", "cat")).toBe(true);
    expect(fitsSpecies("cat", "dog")).toBe(false);
  });
});
