import { describe, expect, test } from "vitest";
import {
  afterWrongPin,
  createPinRecord,
  FREE_ATTEMPTS,
  idleExpired,
  MAX_FAILURES,
  NO_ATTEMPTS,
  offlineTooLong,
  parseAttemptState,
  parsePinRecord,
  shouldWipe,
  verifyPin,
  waitMs,
} from "./pin";

describe("the PIN itself", () => {
  test("the right PIN opens, a wrong one does not", async () => {
    const record = await createPinRecord("4821");
    expect(await verifyPin("4821", record)).toBe(true);
    expect(await verifyPin("4822", record)).toBe(false);
    expect(await verifyPin("482", record)).toBe(false);
    expect(await verifyPin("", record)).toBe(false);
  });

  test("only 4 to 8 digits are accepted", async () => {
    for (const pin of ["123", "123456789", "12a4", "12 34", ""]) {
      await expect(createPinRecord(pin)).rejects.toThrow();
    }
    await expect(createPinRecord("1234")).resolves.toBeDefined();
    await expect(createPinRecord("12345678")).resolves.toBeDefined();
  });

  test("the same PIN gets a different salt and hash every time, and the PIN is not in the record", async () => {
    const first = await createPinRecord("4821");
    const second = await createPinRecord("4821");
    expect(first.saltHex).not.toBe(second.saltHex);
    expect(first.hashHex).not.toBe(second.hashHex);
    expect(JSON.stringify(first)).not.toContain("4821");
    expect(await verifyPin("4821", second)).toBe(true);
  });

  test("a stored record is read back only if it is well formed", async () => {
    const record = await createPinRecord("4821");
    expect(parsePinRecord(JSON.stringify(record))).toEqual(record);
    expect(parsePinRecord(null)).toBeNull();
    expect(parsePinRecord("nem json")).toBeNull();
    expect(parsePinRecord(JSON.stringify({ ...record, saltHex: "zz" }))).toBeNull();
    expect(parsePinRecord(JSON.stringify({ ...record, iterations: 1 }))).toBeNull();
  });
});

describe("wrong guesses", () => {
  test("the first few are free, then the waiting begins and doubles", () => {
    let state = NO_ATTEMPTS;
    const now = 1_000_000;

    for (let attempt = 1; attempt < FREE_ATTEMPTS; attempt += 1) {
      state = afterWrongPin(state, now);
      expect(waitMs(state, now)).toBe(0);
    }

    state = afterWrongPin(state, now);
    expect(waitMs(state, now)).toBe(30_000);
    state = afterWrongPin(state, now);
    expect(waitMs(state, now)).toBe(60_000);
    state = afterWrongPin(state, now);
    expect(waitMs(state, now)).toBe(120_000);
  });

  test("the waiting never exceeds a quarter of an hour", () => {
    // (In practice the device is wiped long before this; the cap is a safety net.)
    let state = { failures: 14, lockedUntil: 0 };
    state = afterWrongPin(state, 0);
    expect(waitMs(state, 0)).toBe(15 * 60_000);
  });

  test("the wait counts down", () => {
    const state = afterWrongPin({ failures: FREE_ATTEMPTS - 1, lockedUntil: 0 }, 0);
    expect(waitMs(state, 10_000)).toBe(20_000);
    expect(waitMs(state, 30_000)).toBe(0);
    expect(waitMs(state, 90_000)).toBe(0);
  });

  test("too many in a row means the device is wiped", () => {
    expect(shouldWipe({ failures: MAX_FAILURES - 1, lockedUntil: 0 })).toBe(false);
    expect(shouldWipe({ failures: MAX_FAILURES, lockedUntil: 0 })).toBe(true);
  });

  test("a damaged stored state counts as a fresh start rather than a crash", () => {
    expect(parseAttemptState(JSON.stringify({ failures: 3, lockedUntil: 5 }))).toEqual({ failures: 3, lockedUntil: 5 });
    expect(parseAttemptState("nem json")).toEqual(NO_ATTEMPTS);
    expect(parseAttemptState(JSON.stringify({ failures: -1, lockedUntil: 0 }))).toEqual(NO_ATTEMPTS);
    expect(parseAttemptState(undefined)).toEqual(NO_ATTEMPTS);
  });
});

describe("when the device locks", () => {
  test("after ten idle minutes by default", () => {
    expect(idleExpired(0, 9 * 60_000)).toBe(false);
    expect(idleExpired(0, 10 * 60_000)).toBe(true);
    expect(idleExpired(0, 5_000, 5_000)).toBe(true);
  });

  test("after more than a week without reaching the server", () => {
    const day = 86_400_000;
    expect(offlineTooLong(0, 7 * day)).toBe(false);
    expect(offlineTooLong(0, 7 * day + 1)).toBe(true);
    expect(offlineTooLong(null, 100 * day)).toBe(false);
  });
});
