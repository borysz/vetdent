import { describe, expect, test } from "vitest";
import { getTooth } from "@/domain/teeth/catalog";
import { badgeOf, getCode, isValidLevel } from "./codes";
import {
  EMPTY_MARKS,
  canApply,
  carriedOver,
  deepestPocket,
  exceedsThreshold,
  parseFindings,
  parsePockets,
  parseProcedures,
  selectArch,
  selectQuadrant,
  selectType,
  serializeFindings,
  serializePockets,
  serializeProcedures,
  suggestedPdLevel,
  toothColor,
  withFinding,
  withProcedure,
  withProcedureState,
  withoutCode,
  type ToothMarks,
} from "./chart";
import { DEFAULT_QUICK_BUTTONS, levelsOf, quickButtonsFor } from "./quick-buttons";

const marks = (partial: Partial<ToothMarks>): ToothMarks => ({ ...EMPTY_MARKS, ...partial });
const tooth = (species: "dog" | "cat", number: number) => getTooth(species, number)!;

describe("codes", () => {
  test("a grade must belong to its code; codes without grades take none", () => {
    expect(isValidLevel("T", "2")).toBe(true);
    expect(isValidLevel("T", "4")).toBe(false);
    expect(isValidLevel("T", "")).toBe(false);
    expect(isValidLevel("U", "")).toBe(true);
    expect(isValidLevel("U", "1")).toBe(false);
    expect(isValidLevel("FX", "NC")).toBe(true);
    expect(isValidLevel("nonsense", "")).toBe(false);
  });

  test("resorptive lesions are for cats and furcation for multi-rooted teeth only", () => {
    expect(getCode("RES")?.species).toBe("cat");
    expect(getCode("Fur")?.multiRootOnly).toBe(true);
  });

  test("the badge keeps the meaning when the colour does not carry it", () => {
    expect(badgeOf("T", "2")).toBe("T2");
    expect(badgeOf("PD", "3")).toBe("PD3");
    expect(badgeOf("FX", "C")).toBe("FX-C");
    expect(badgeOf("RES", "3")).toBe("TR3");
    expect(badgeOf("M", "missing")).toBe("M");
    expect(badgeOf("M", "prev")).toBe("EXT-prev");
    expect(badgeOf("EXT", "SURG")).toBe("EXT-SURG");
    expect(badgeOf("U", "")).toBe("U");
  });
});

describe("the stored text", () => {
  test("is canonical: one mark per code, in catalogue order, invalid ones dropped", () => {
    const text = serializeFindings([
      { code: "PD", level: "2" },
      { code: "T", level: "1" },
      { code: "T", level: "3" },
      { code: "T", level: "9" },
    ]);
    // The last valid mark of a code wins (T3 replaces T1; T9 is not a grade), and the order is the catalogue's.
    expect(text).toBe('[{"code":"T","level":"3"},{"code":"PD","level":"2"}]');
    expect(parseFindings(text)).toEqual([
      { code: "T", level: "3" },
      { code: "PD", level: "2" },
    ]);
  });

  test("a procedure without a state counts as done", () => {
    expect(parseProcedures('[{"code":"U","level":""}]')).toEqual([{ code: "U", level: "", state: "done" }]);
    expect(serializeProcedures([{ code: "EXT", level: "S", state: "planned" }])).toBe('[{"code":"EXT","level":"S","state":"planned"}]');
  });

  test("garbage gives an empty list", () => {
    expect(parseFindings("not json")).toEqual([]);
    expect(parseProcedures(null)).toEqual([]);
  });
});

describe("adding marks", () => {
  test("the same code replaces its earlier grade", () => {
    const first = withFinding(EMPTY_MARKS, "T", "1");
    expect(withFinding(first, "T", "3").findings).toEqual([{ code: "T", level: "3" }]);
  });

  test("healthy excludes the other findings, and another finding removes healthy", () => {
    const withTartar = withFinding(EMPTY_MARKS, "T", "2");
    expect(withFinding(withTartar, "0", "").findings).toEqual([{ code: "0", level: "" }]);
    expect(withFinding(withFinding(EMPTY_MARKS, "0", ""), "G", "1").findings).toEqual([{ code: "G", level: "1" }]);
  });

  test("a missing tooth has nothing else on it", () => {
    const busy = withProcedure(withFinding(EMPTY_MARKS, "PD", "3"), "U", "", "done");
    expect(withFinding(busy, "M", "missing")).toEqual({ findings: [{ code: "M", level: "missing" }], procedures: [] });
  });

  test("removing a code and changing a procedure state", () => {
    const planned = withProcedure(EMPTY_MARKS, "EXT", "S", "planned");
    expect(withProcedureState(planned, "EXT", "done").procedures[0].state).toBe("done");
    expect(withoutCode(planned, "EXT")).toEqual(EMPTY_MARKS);
  });
});

describe("what may be added", () => {
  test("a resorptive lesion is not offered for a dog", () => {
    expect(canApply("dog", tooth("dog", 108), EMPTY_MARKS, "RES", "2")).toEqual({ ok: false, reason: "species" });
    expect(canApply("cat", tooth("cat", 108), EMPTY_MARKS, "RES", "2")).toEqual({ ok: true });
  });

  test("furcation only on a multi-rooted tooth", () => {
    expect(canApply("dog", tooth("dog", 101), EMPTY_MARKS, "Fur", "1")).toEqual({ ok: false, reason: "furcation" });
    expect(canApply("dog", tooth("dog", 108), EMPTY_MARKS, "Fur", "1")).toEqual({ ok: true });
  });

  test("a missing tooth takes no new mark, only a change of how it is missing", () => {
    const missing = marks({ findings: [{ code: "M", level: "missing" }] });
    expect(canApply("dog", tooth("dog", 104), missing, "PD", "2")).toEqual({ ok: false, reason: "missing" });
    expect(canApply("dog", tooth("dog", 104), missing, "EXT", "S")).toEqual({ ok: false, reason: "missing" });
    expect(canApply("dog", tooth("dog", 104), missing, "M", "prev")).toEqual({ ok: true });
  });

  test("an unknown code or grade is invalid", () => {
    expect(canApply("dog", tooth("dog", 104), EMPTY_MARKS, "T", "7")).toEqual({ ok: false, reason: "invalid" });
    expect(canApply("dog", tooth("dog", 104), EMPTY_MARKS, "XYZ", "")).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("colour", () => {
  test("follows the priority list when several apply", () => {
    const tartarAndGum = marks({ findings: [{ code: "T", level: "2" }, { code: "G", level: "1" }] });
    expect(toothColor(tartarAndGum)).toBe("orange");
    expect(toothColor(withProcedure(tartarAndGum, "ENDO", "closed", "planned"))).toBe("blue");
    expect(toothColor(withProcedure(withProcedure(tartarAndGum, "ENDO", "closed", "done"), "EXT", "S", "planned"))).toBe("red");
  });

  test("tartar alone is yellow, healthy green, missing grey, unexamined none", () => {
    expect(toothColor(withFinding(EMPTY_MARKS, "T", "1"))).toBe("yellow");
    expect(toothColor(withFinding(EMPTY_MARKS, "0", ""))).toBe("green");
    expect(toothColor(withFinding(EMPTY_MARKS, "M", "missing"))).toBe("gray");
    expect(toothColor(EMPTY_MARKS)).toBe("none");
  });

  test("a procedure that is only planned also colours the tooth", () => {
    expect(toothColor(withProcedure(EMPTY_MARKS, "EXT", "SURG", "planned"))).toBe("red");
  });
});

describe("carry-over to the next visit", () => {
  test("a missing tooth stays as it was", () => {
    const missing = marks({ findings: [{ code: "M", level: "imp" }] });
    expect(carriedOver(missing)).toEqual(missing);
  });

  test("an extracted tooth is from then on 'extracted earlier'; a planned extraction is not carried", () => {
    expect(carriedOver(withProcedure(EMPTY_MARKS, "EXT", "S", "done"))).toEqual({
      findings: [{ code: "M", level: "prev" }],
      procedures: [],
    });
    expect(carriedOver(withProcedure(EMPTY_MARKS, "EXT", "S", "planned"))).toBeNull();
  });

  test("a finished root canal is carried, a planned one is not, and ordinary findings are not", () => {
    const done = withProcedure(EMPTY_MARKS, "ENDO", "closed", "done");
    expect(carriedOver(done)).toEqual(done);
    expect(carriedOver(withProcedure(EMPTY_MARKS, "ENDO", "closed", "planned"))).toBeNull();
    expect(carriedOver(withFinding(EMPTY_MARKS, "PD", "3"))).toBeNull();
  });
});

describe("selecting teeth", () => {
  test("a quadrant, an arch and a tooth type", () => {
    expect(selectQuadrant("dog", 1)).toHaveLength(10);
    expect(selectQuadrant("dog", 3)).toHaveLength(11);
    expect(selectArch("dog", "upper")).toHaveLength(20);
    expect(selectArch("cat", "lower")).toHaveLength(14);
    expect(selectType("dog", "canine").sort()).toEqual([104, 204, 304, 404]);
    expect(selectType("cat", "incisor")).toHaveLength(12);
  });
});

describe("pocket depth", () => {
  test("six measuring points, whole millimetres up to 12, nothing measured is empty", () => {
    expect(parsePockets([3, 4, 3, null, 2, 5])).toEqual([3, 4, 3, null, 2, 5]);
    expect(parsePockets([13, -1, 2.5, "x", null, 12])).toEqual([null, null, null, null, null, 12]);
    expect(serializePockets([null, null, null, null, null, null])).toBe("[]");
    expect(parsePockets("[]")).toEqual([]);
  });

  test("a depth above the threshold is flagged, the threshold itself is not", () => {
    expect(exceedsThreshold([3, 4, 3, null, 2, 4])).toBe(false);
    expect(exceedsThreshold([3, 5, 3, null, 2, 4])).toBe(true);
    expect(exceedsThreshold([3, 5], 6)).toBe(false);
    expect(deepestPocket([])).toBeNull();
  });

  test("a PD grade is only suggested from the deepest point", () => {
    expect(suggestedPdLevel([2, 1, 2, null, 2, 2])).toBeNull();
    expect(suggestedPdLevel([3, 2])).toBe("2");
    expect(suggestedPdLevel([4, 2])).toBe("2");
    expect(suggestedPdLevel([5, 2])).toBe("3");
    expect(suggestedPdLevel([6, 2])).toBe("3");
    expect(suggestedPdLevel([7, 2])).toBe("4");
    expect(suggestedPdLevel([])).toBeNull();
  });
});

describe("quick buttons", () => {
  test("the resorptive-lesion button is only for cats", () => {
    expect(quickButtonsFor("dog").some((button) => button.id === "RES")).toBe(false);
    expect(quickButtonsFor("cat").some((button) => button.id === "RES")).toBe(true);
  });

  test("a button of one code asks for its grade; the composite button does not", () => {
    const byId = (id: string) => DEFAULT_QUICK_BUTTONS.find((button) => button.id === id)!;
    expect(levelsOf(byId("PD"))).toEqual(["1", "2", "3", "4"]);
    expect(levelsOf(byId("U"))).toEqual([]);
    expect(levelsOf(byId("U+POL"))).toEqual([]);
    expect(byId("U+POL").actions.map((action) => action.code)).toEqual(["U", "POL"]);
  });
});
