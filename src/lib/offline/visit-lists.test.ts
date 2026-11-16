import { describe, expect, test } from "vitest";
import {
  EMPTY_LIST_TEXT,
  parseBlocks,
  parseMedications,
  parseTags,
  serializeBlocks,
  serializeMedications,
  serializeTags,
} from "./visit-lists";

describe("complaint tags", () => {
  test("the same set gives the same text, whatever the order", () => {
    expect(serializeTags(["pain", "halitosis"])).toBe(serializeTags(["halitosis", "pain"]));
    expect(serializeTags(["pain", "halitosis"])).toBe('["halitosis","pain"]');
  });

  test("unknown and repeated tags are dropped; nothing gives the empty list", () => {
    expect(parseTags(["tartar", "tartar", "nonsense", 3])).toEqual(["tartar"]);
    expect(serializeTags([])).toBe(EMPTY_LIST_TEXT);
    expect(parseTags("not json")).toEqual([]);
  });
});

describe("anaesthesia blocks", () => {
  test("keys come in a fixed order, so equal blocks give equal text", () => {
    const a = serializeBlocks([{ nerve: "n. infraorbitalis", side: "left", agent: "bupivakain", dose: "0,2 ml" }]);
    const b = serializeBlocks(JSON.parse('[{"dose":"0,2 ml","agent":"bupivakain","side":"left","nerve":"n. infraorbitalis"}]'));
    expect(a).toBe(b);
  });

  test("a block without a nerve is dropped, an unknown side is cleared, text is trimmed", () => {
    expect(parseBlocks([{ nerve: " ", side: "left" }, { nerve: " n. mentalis ", side: "sideways" }])).toEqual([
      { nerve: "n. mentalis", side: "", agent: "", dose: "" },
    ]);
  });

  test("no more than 20 are kept", () => {
    const many = Array.from({ length: 25 }, (_, index) => ({ nerve: `n. ${index}` }));
    expect(parseBlocks(many)).toHaveLength(20);
  });
});

describe("medications", () => {
  test("a medication needs a name", () => {
    expect(parseMedications([{ name: "", dose: "1 tabletta" }, { name: "Amoxicillin", dose: "10 mg/kg" }])).toEqual([
      { name: "Amoxicillin", dose: "10 mg/kg", frequency: "", duration: "" },
    ]);
  });

  test("the text survives a round trip unchanged", () => {
    const text = serializeMedications([{ name: "Meloxicam", dose: "0,1 mg/kg", frequency: "naponta", duration: "5 nap" }]);
    expect(serializeMedications(parseMedications(text))).toBe(text);
  });
});
