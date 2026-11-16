import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { clearPin, hasPin, readAttempts, setPin, tryUnlock } from "./device-security";
import { LocalDatabase } from "./local-db";
import { FREE_ATTEMPTS } from "./pin";

let db: LocalDatabase;
let counter = 0;

beforeEach(() => {
  counter += 1;
  db = new LocalDatabase(`security-test-${counter}`);
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("unlocking the device", () => {
  test("without a PIN there is nothing to unlock", async () => {
    expect(await hasPin(db)).toBe(false);
    expect(await tryUnlock(db, "1234", 0)).toEqual({ ok: false, reason: "no_pin" });
  });

  test("the right PIN unlocks and resets the count of wrong guesses", async () => {
    await setPin(db, "4821");
    expect(await hasPin(db)).toBe(true);

    await tryUnlock(db, "0000", 1000);
    await tryUnlock(db, "1111", 2000);
    expect((await readAttempts(db)).failures).toBe(2);

    expect(await tryUnlock(db, "4821", 3000)).toEqual({ ok: true });
    expect((await readAttempts(db)).failures).toBe(0);
  });

  test("wrong guesses are counted, and after the free ones the user has to wait", async () => {
    await setPin(db, "4821");
    let result;
    for (let attempt = 1; attempt <= FREE_ATTEMPTS; attempt += 1) {
      result = await tryUnlock(db, "0000", 10_000);
    }
    expect(result).toMatchObject({ ok: false, reason: "wrong" });

    const waiting = await tryUnlock(db, "4821", 20_000);
    expect(waiting).toMatchObject({ ok: false, reason: "waiting" });
  });

  test("a guess during the wait is refused without being counted – even the right PIN", async () => {
    await setPin(db, "4821");
    for (let attempt = 1; attempt <= FREE_ATTEMPTS; attempt += 1) await tryUnlock(db, "0000", 10_000);
    const failures = (await readAttempts(db)).failures;

    await tryUnlock(db, "4821", 15_000);
    await tryUnlock(db, "0000", 15_000);
    expect((await readAttempts(db)).failures).toBe(failures);

    // Once the wait is over the right PIN works again.
    expect(await tryUnlock(db, "4821", 10_000 + 31_000)).toEqual({ ok: true });
  });

  test("the wait survives a restart, because the count lives in the device's database", async () => {
    await setPin(db, "4821");
    for (let attempt = 1; attempt <= FREE_ATTEMPTS; attempt += 1) await tryUnlock(db, "0000", 10_000);

    db.close();
    const reopened = new LocalDatabase(`security-test-${counter}`);
    expect(await tryUnlock(reopened, "4821", 12_000)).toMatchObject({ ok: false, reason: "waiting" });
    reopened.close();
  });

  test("removing the PIN removes the count too", async () => {
    await setPin(db, "4821");
    await tryUnlock(db, "0000", 1);
    await clearPin(db);
    expect(await hasPin(db)).toBe(false);
    expect((await readAttempts(db)).failures).toBe(0);
  });

  test("setting a new PIN starts with a clean slate", async () => {
    await setPin(db, "4821");
    for (let attempt = 1; attempt <= FREE_ATTEMPTS; attempt += 1) await tryUnlock(db, "0000", 10_000);
    await setPin(db, "9999");
    expect(await tryUnlock(db, "9999", 10_001)).toEqual({ ok: true });
  });
});
