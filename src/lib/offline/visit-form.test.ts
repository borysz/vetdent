import { describe, expect, test } from "vitest";
import {
  ageOf,
  parseWeight,
  suggestedFollowUp,
  textOrNull,
  toInputDateTime,
  toStoredDateTime,
  validFollowUpDate,
  validVisitDate,
} from "./visit-form";

const NOW = new Date(2026, 10, 16, 10, 0); // 16 November 2026

describe("visit date", () => {
  test("today and tomorrow are fine, later is not", () => {
    expect(validVisitDate("2026-11-16", NOW)).toBe(true);
    expect(validVisitDate("2026-11-17", NOW)).toBe(true);
    expect(validVisitDate("2026-11-18", NOW)).toBe(false);
  });

  test("not a real date, or before 2000, is refused", () => {
    expect(validVisitDate("2026-02-30", NOW)).toBe(false);
    expect(validVisitDate("1999-12-31", NOW)).toBe(false);
    expect(validVisitDate("", NOW)).toBe(false);
  });
});

describe("follow-up date", () => {
  test("up to two years ahead", () => {
    expect(validFollowUpDate("2028-11-16", NOW)).toBe(true);
    expect(validFollowUpDate("2028-11-17", NOW)).toBe(false);
  });

  test("is suggested 12 days after the visit, across a month end", () => {
    expect(suggestedFollowUp("2026-11-16")).toBe("2026-11-28");
    expect(suggestedFollowUp("2026-11-25")).toBe("2026-12-07");
    expect(suggestedFollowUp("nonsense")).toBeNull();
  });
});

describe("weight", () => {
  test("accepts a comma or a point and rounds to two decimals", () => {
    expect(parseWeight("4,5")).toBe(4.5);
    expect(parseWeight("12.345")).toBe(12.35);
  });

  test("blank is no value; zero, negative, too big and text are invalid", () => {
    expect(parseWeight("  ")).toBeNull();
    expect(parseWeight("0")).toBe("invalid");
    expect(parseWeight("-1")).toBe("invalid");
    expect(parseWeight("201")).toBe("invalid");
    expect(parseWeight("abc")).toBe("invalid");
  });
});

describe("last fed time", () => {
  test("is stored with seconds, the way the database returns it", () => {
    expect(toStoredDateTime("2026-11-15T20:30")).toBe("2026-11-15T20:30:00");
    expect(toInputDateTime("2026-11-15T20:30:00")).toBe("2026-11-15T20:30");
  });

  test("blank is no value; anything else is invalid", () => {
    expect(toStoredDateTime("")).toBeNull();
    expect(toInputDateTime(null)).toBe("");
    expect(toStoredDateTime("yesterday evening")).toBe("invalid");
    expect(toStoredDateTime("2026-13-15T20:30")).toBe("invalid");
  });
});

describe("small helpers", () => {
  test("blank text is null", () => {
    expect(textOrNull("   ")).toBeNull();
    expect(textOrNull(" asa ")).toBe("asa");
  });

  test("age in years and months", () => {
    expect(ageOf("2020-11-16", NOW)).toEqual({ years: 6, months: 0 });
    expect(ageOf("2020-12-01", NOW)).toEqual({ years: 5, months: 11 });
    expect(ageOf("2026-11-20", NOW)).toBeNull();
    expect(ageOf(null, NOW)).toBeNull();
  });
});
