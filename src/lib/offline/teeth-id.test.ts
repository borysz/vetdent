import { describe, expect, test } from "vitest";
import { getTeeth } from "@/domain/teeth/catalog";
import { toothRecordId } from "./teeth-id";

const VISIT = "5a2df2c1-499d-4dd8-97bb-f02ffaa9a7ee";

describe("the id of a tooth record", () => {
  test("is the same wherever it is computed", () => {
    expect(toothRecordId(VISIT, 104)).toBe(toothRecordId(VISIT, 104));
    expect(toothRecordId(VISIT.toUpperCase(), 104)).toBe(toothRecordId(VISIT, 104));
  });

  test("looks like a UUID the database accepts", () => {
    expect(toothRecordId(VISIT, 104)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test("differs for every tooth of a visit and for every visit of a tooth", () => {
    const ids = new Set(getTeeth("dog").map((tooth) => toothRecordId(VISIT, tooth.number)));
    expect(ids.size).toBe(42);
    expect(toothRecordId("00000000-0000-4000-8000-000000000001", 104)).not.toBe(toothRecordId(VISIT, 104));
  });
});
