import { describe, expect, test } from "vitest";
import { appendText, findTeeth, sameTarget, suggestTarget, targetOptions } from "./triadan";

describe("finding teeth in a dictated text", () => {
  test("the example of the specification", () => {
    expect(findTeeth("a 104-es fog gyökerénél sipolynyílás van, sárgás váladékkal", "dog")).toEqual([104]);
  });

  test("several teeth, in the order mentioned, without repeats", () => {
    expect(findTeeth("a 204-es és a 304-es fog, majd megint a 204", "dog")).toEqual([204, 304]);
  });

  test("only teeth the species has: a dog has 311, a cat does not; a cat has no 105", () => {
    expect(findTeeth("311-es fog", "dog")).toEqual([311]);
    expect(findTeeth("311-es fog", "cat")).toEqual([]);
    expect(findTeeth("105-ös fog", "cat")).toEqual([]);
    expect(findTeeth("106-os fog", "cat")).toEqual([106]);
  });

  test("a number inside a longer number, or a measurement, is not a tooth", () => {
    expect(findTeeth("1040 forint", "dog")).toEqual([]);
    expect(findTeeth("a 2104-es", "dog")).toEqual([]);
    expect(findTeeth("110 mg meloxicam", "dog")).toEqual([]);
    expect(findTeeth("108 ml infúzió", "dog")).toEqual([]);
    expect(findTeeth("1,104 érték", "dog")).toEqual([]);
  });

  test("numbers that are no Triadan number", () => {
    expect(findTeeth("100 és 412 és 512 és 4", "dog")).toEqual([]);
  });
});

describe("where a dictated text goes", () => {
  test("a tooth named in the text wins over the selection", () => {
    expect(suggestTarget("a 104-es foggyökér", "dog", [208])).toEqual({ kind: "tooth", tooth: 104 });
  });

  test("with no number, the single selected tooth", () => {
    expect(suggestTarget("sipolynyílás van", "dog", [208])).toEqual({ kind: "tooth", tooth: 208 });
  });

  test("with no number and no (or several) selected teeth, the general note", () => {
    expect(suggestTarget("sipolynyílás van", "dog", [])).toEqual({ kind: "general" });
    expect(suggestTarget("sipolynyílás van", "dog", [208, 209])).toEqual({ kind: "general" });
  });

  test("the confirmation offers the general note first, then named and selected teeth, then the rest", () => {
    const options = targetOptions("a 305 fog", "cat", [409]);
    expect(options[0]).toEqual({ kind: "general" });
    expect(options.slice(1, 3)).toEqual([{ kind: "tooth", tooth: 409 }, { kind: "tooth", tooth: 101 }]);
    expect(options).toHaveLength(1 + 30);
    expect(sameTarget(options[1], { kind: "tooth", tooth: 409 })).toBe(true);
    expect(sameTarget(options[0], { kind: "tooth", tooth: 409 })).toBe(false);
  });
});

describe("appending text", () => {
  test("goes on a new line, and an empty field takes it as it is", () => {
    expect(appendText("", " új szöveg ")).toBe("új szöveg");
    expect(appendText("régi", "új")).toBe("régi\núj");
    expect(appendText("régi\n", "új")).toBe("régi\núj");
  });

  test("nothing is added for an empty dictation", () => {
    expect(appendText("régi", "   ")).toBe("régi");
  });
});
