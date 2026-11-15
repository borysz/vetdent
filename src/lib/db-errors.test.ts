import { describe, expect, test } from "vitest";
import hu from "../../messages/hu.json";
import { DB_ERROR_KEYS, dbErrorKey } from "./db-errors";

describe("dbErrorKey", () => {
  test("passes our own error codes through", () => {
    expect(dbErrorKey({ message: "last_owner" })).toBe("last_owner");
    expect(dbErrorKey({ message: "invitation_expired" })).toBe("invitation_expired");
  });

  test("hides everything else", () => {
    expect(dbErrorKey({ message: 'duplicate key value violates unique constraint "x"' })).toBe("unknown");
    expect(dbErrorKey({ message: "" })).toBe("unknown");
    expect(dbErrorKey({ message: null })).toBe("unknown");
    expect(dbErrorKey({})).toBe("unknown");
  });

  test("every code has a Hungarian message", () => {
    for (const key of [...DB_ERROR_KEYS, "unknown"] as const) {
      expect(hu.dbErrors[key], key).toBeTruthy();
    }
  });
});
