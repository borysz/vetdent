import type { LocalDatabase } from "./local-db";
import { readMeta, writeMeta } from "./local-db";
import {
  afterWrongPin,
  createPinRecord,
  NO_ATTEMPTS,
  parseAttemptState,
  parsePinRecord,
  verifyPin,
  type AttemptState,
} from "./pin";

/** Reading and writing the device PIN and the wrong-guess counter in the device's own database. */

const PIN_KEY = "device.pin";
const ATTEMPTS_KEY = "device.pinAttempts";

export async function hasPin(db: LocalDatabase): Promise<boolean> {
  return parsePinRecord(await readMeta(db, PIN_KEY)) !== null;
}

export async function setPin(db: LocalDatabase, pin: string): Promise<void> {
  const record = await createPinRecord(pin);
  await writeMeta(db, PIN_KEY, JSON.stringify(record));
  await writeMeta(db, ATTEMPTS_KEY, JSON.stringify(NO_ATTEMPTS));
}

export async function clearPin(db: LocalDatabase): Promise<void> {
  await db.meta.delete(PIN_KEY);
  await db.meta.delete(ATTEMPTS_KEY);
}

export async function readAttempts(db: LocalDatabase): Promise<AttemptState> {
  return parseAttemptState(await readMeta(db, ATTEMPTS_KEY));
}

export type UnlockResult =
  | { ok: true }
  | { ok: false; reason: "wrong"; attempts: AttemptState }
  | { ok: false; reason: "waiting"; attempts: AttemptState }
  | { ok: false; reason: "no_pin" };

/**
 * Checks a PIN. A guess made while the waiting period is running is refused
 * without being counted or even checked, so the wait cannot be shortened by
 * trying anyway.
 */
export async function tryUnlock(db: LocalDatabase, pin: string, now: number): Promise<UnlockResult> {
  const record = parsePinRecord(await readMeta(db, PIN_KEY));
  if (!record) return { ok: false, reason: "no_pin" };

  const attempts = await readAttempts(db);
  if (attempts.lockedUntil > now) return { ok: false, reason: "waiting", attempts };

  if (await verifyPin(pin, record)) {
    await writeMeta(db, ATTEMPTS_KEY, JSON.stringify(NO_ATTEMPTS));
    return { ok: true };
  }

  const next = afterWrongPin(attempts, now);
  await writeMeta(db, ATTEMPTS_KEY, JSON.stringify(next));
  return { ok: false, reason: "wrong", attempts: next };
}
