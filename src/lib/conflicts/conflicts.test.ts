import { describe, expect, test } from "vitest";
import messages from "../../../messages/hu.json";
import type { Translate } from "@/domain/summary/summary";
import { conflictFieldKey, CONFLICT_TABLES, formatConflictValue, isConflictTable } from "./conflicts";

const t: Translate = (key, values = {}) => {
  let node: unknown = messages;
  for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
  if (typeof node !== "string") throw new Error(`missing text: ${key}`);
  return node.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? `{${name}}`));
};

const show = (value: unknown, field = "x") => formatConflictValue(field, value, t);

describe("formatConflictValue", () => {
  test("writes nothing as an empty value", () => {
    for (const nothing of [null, undefined, "", [], {}, "[]"]) expect(show(nothing)).toBe("(üres)");
  });

  test("writes plain values as they are", () => {
    expect(show("Kovács Anna")).toBe("Kovács Anna");
    expect(show(18.5)).toBe("18.5");
    expect(show(true)).toBe("igen");
    expect(show(false)).toBe("nem");
  });

  test("writes a date the Hungarian way", () => {
    expect(show("2026-11-16")).toBe("2026. 11. 16.");
  });

  test("reads findings and procedures that travel as JSON text", () => {
    expect(show(JSON.stringify([{ code: "T", level: "2" }, { code: "M", level: "missing" }]), "findings")).toBe("T2, M");
    expect(show([{ code: "ENDO", level: "closed", state: "planned" }], "procedures")).toContain("(tervezett)");
  });

  test("writes medicines by name and dose", () => {
    expect(show([{ name: "Meloxicam", dose: "0,1 mg/kg", frequency: "naponta" }], "medications")).toBe("Meloxicam 0,1 mg/kg");
  });

  test("does not trip over a text that only starts like JSON", () => {
    expect(show("[nem lista")).toBe("[nem lista");
  });

  test("shortens a very long text", () => {
    const long = show("a".repeat(1000));
    expect(long.length).toBeLessThan(400);
    expect(long.endsWith("…")).toBe(true);
  });
});

describe("tables", () => {
  test("knows the tables the database may record", () => {
    for (const table of CONFLICT_TABLES) expect(isConflictTable(table)).toBe(true);
    expect(isConflictTable("profiles")).toBe(false);
  });

  test("every table has a name in the texts", () => {
    for (const table of CONFLICT_TABLES) expect(() => t(`conflicts.tables.${table}`), table).not.toThrow();
    expect(conflictFieldKey("clients", "full_name")).toBe("conflicts.fields.clients.full_name");
  });
});
