import { describe, expect, test } from "vitest";
import { matchesPrefix, protectedPrefixes, routes, safeNextPath } from "./routes";

describe("safeNextPath", () => {
  test("keeps paths inside the application", () => {
    expect(safeNextPath("/app")).toBe("/app");
    expect(safeNextPath("/app/paciensek?oldal=2")).toBe("/app/paciensek?oldal=2");
  });

  test("falls back when the value is missing", () => {
    expect(safeNextPath(null)).toBe(routes.app);
    expect(safeNextPath(undefined)).toBe(routes.app);
    expect(safeNextPath("")).toBe(routes.app);
    expect(safeNextPath(null, routes.onboarding)).toBe(routes.onboarding);
  });

  test("rejects anything that could leave the site", () => {
    expect(safeNextPath("https://evil.example")).toBe(routes.app);
    expect(safeNextPath("//evil.example")).toBe(routes.app);
    expect(safeNextPath("/\\evil.example")).toBe(routes.app);
    expect(safeNextPath("javascript:alert(1)")).toBe(routes.app);
    expect(safeNextPath("app")).toBe(routes.app);
    expect(safeNextPath("/\t/evil.example")).toBe(routes.app);
  });
});

describe("matchesPrefix", () => {
  test("matches the prefix itself and anything below it", () => {
    expect(matchesPrefix("/app", protectedPrefixes)).toBe(true);
    expect(matchesPrefix("/app/beallitasok", protectedPrefixes)).toBe(true);
  });

  test("does not match look-alike paths", () => {
    expect(matchesPrefix("/application", protectedPrefixes)).toBe(false);
    expect(matchesPrefix("/", protectedPrefixes)).toBe(false);
    expect(matchesPrefix("/belepes", protectedPrefixes)).toBe(false);
  });
});
