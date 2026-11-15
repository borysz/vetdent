import { describe, expect, test } from "vitest";
import {
  canHaveFurcation,
  getOdontogramRows,
  getTeeth,
  getTeethInQuadrant,
  getTooth,
  isValidTooth,
  toothTypeOfPosition,
} from "./catalog";

const numbers = (teeth: readonly { number: number }[]) => teeth.map((tooth) => tooth.number);

describe("tooth catalogue", () => {
  test("a dog has 42 permanent teeth, a cat has 30", () => {
    expect(getTeeth("dog")).toHaveLength(42);
    expect(getTeeth("cat")).toHaveLength(30);
  });

  test("tooth numbers are unique within a species", () => {
    for (const species of ["dog", "cat"] as const) {
      const all = numbers(getTeeth(species));
      expect(new Set(all).size).toBe(all.length);
    }
  });

  test("dog quadrants follow the Triadan ranges", () => {
    expect(numbers(getTeethInQuadrant("dog", 1))).toEqual([101, 102, 103, 104, 105, 106, 107, 108, 109, 110]);
    expect(numbers(getTeethInQuadrant("dog", 2))).toEqual([201, 202, 203, 204, 205, 206, 207, 208, 209, 210]);
    expect(numbers(getTeethInQuadrant("dog", 3))).toEqual([301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311]);
    expect(numbers(getTeethInQuadrant("dog", 4))).toEqual([401, 402, 403, 404, 405, 406, 407, 408, 409, 410, 411]);
  });

  test("cat quadrants skip the teeth cats do not have", () => {
    expect(numbers(getTeethInQuadrant("cat", 1))).toEqual([101, 102, 103, 104, 106, 107, 108, 109]);
    expect(numbers(getTeethInQuadrant("cat", 2))).toEqual([201, 202, 203, 204, 206, 207, 208, 209]);
    expect(numbers(getTeethInQuadrant("cat", 3))).toEqual([301, 302, 303, 304, 307, 308, 309]);
    expect(numbers(getTeethInQuadrant("cat", 4))).toEqual([401, 402, 403, 404, 407, 408, 409]);
  });

  test("validity is species specific", () => {
    expect(isValidTooth("dog", 105)).toBe(true);
    expect(isValidTooth("cat", 105)).toBe(false);
    expect(isValidTooth("dog", 311)).toBe(true);
    expect(isValidTooth("cat", 311)).toBe(false);
    expect(isValidTooth("dog", 111)).toBe(false);
    expect(isValidTooth("dog", 501)).toBe(false);
    expect(getTooth("cat", 306)).toBeUndefined();
  });

  test("tooth type follows from the Triadan position", () => {
    expect(toothTypeOfPosition(1)).toBe("incisor");
    expect(toothTypeOfPosition(3)).toBe("incisor");
    expect(toothTypeOfPosition(4)).toBe("canine");
    expect(toothTypeOfPosition(5)).toBe("premolar");
    expect(toothTypeOfPosition(8)).toBe("premolar");
    expect(toothTypeOfPosition(9)).toBe("molar");
    expect(toothTypeOfPosition(11)).toBe("molar");
  });

  test("jaw and patient side are derived from the quadrant", () => {
    expect(getTooth("dog", 104)).toMatchObject({ jaw: "maxilla", side: "right", type: "canine" });
    expect(getTooth("dog", 204)).toMatchObject({ jaw: "maxilla", side: "left" });
    expect(getTooth("dog", 309)).toMatchObject({ jaw: "mandible", side: "left", type: "molar" });
    expect(getTooth("dog", 409)).toMatchObject({ jaw: "mandible", side: "right" });
  });

  test("furcation is only possible on multi-rooted teeth", () => {
    const incisor = getTooth("dog", 101);
    const carnassial = getTooth("dog", 108);
    expect(incisor && canHaveFurcation(incisor)).toBe(false);
    expect(carnassial && canHaveFurcation(carnassial)).toBe(true);
    for (const species of ["dog", "cat"] as const) {
      for (const tooth of getTeeth(species)) {
        if (tooth.type === "incisor" || tooth.type === "canine") {
          expect(canHaveFurcation(tooth)).toBe(false);
        }
      }
    }
  });
});

describe("odontogram screen order", () => {
  test("the patient's right side is on the left edge of the screen (dog)", () => {
    const { upper, lower } = getOdontogramRows("dog");
    expect(numbers(upper)).toEqual([
      110, 109, 108, 107, 106, 105, 104, 103, 102, 101, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210,
    ]);
    expect(numbers(lower)).toEqual([
      411, 410, 409, 408, 407, 406, 405, 404, 403, 402, 401, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311,
    ]);
  });

  test("the cat rows use the same layout with fewer teeth", () => {
    const { upper, lower } = getOdontogramRows("cat");
    expect(numbers(upper)).toEqual([109, 108, 107, 106, 104, 103, 102, 101, 201, 202, 203, 204, 206, 207, 208, 209]);
    expect(numbers(lower)).toEqual([409, 408, 407, 404, 403, 402, 401, 301, 302, 303, 304, 307, 308, 309]);
  });

  test("every tooth appears on screen exactly once", () => {
    for (const species of ["dog", "cat"] as const) {
      const { upper, lower } = getOdontogramRows(species);
      const onScreen = [...numbers(upper), ...numbers(lower)].sort((a, b) => a - b);
      expect(onScreen).toEqual(numbers(getTeeth(species)));
    }
  });
});
