/**
 * Device PIN: a short code that unlocks the app after it was idle, so a
 * tablet left on the treatment table does not show patient data to anyone.
 *
 * The PIN is a convenience lock for a device the user is already signed in
 * on – not a replacement for the password. It is stored only as a salted,
 * slow hash, never as the code itself.
 */

export const PIN_PATTERN = /^\d{4,8}$/;

const ITERATIONS = 150_000;
const HASH_BITS = 256;

export interface PinRecord {
  saltHex: string;
  hashHex: string;
  iterations: number;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, HASH_BITS);
  return new Uint8Array(bits);
}

/** Compares without stopping at the first difference, so timing reveals nothing. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function createPinRecord(pin: string): Promise<PinRecord> {
  if (!PIN_PATTERN.test(pin)) throw new Error("A PIN is 4 to 8 digits");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(pin, salt, ITERATIONS);
  return { saltHex: toHex(salt), hashHex: toHex(hash), iterations: ITERATIONS };
}

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  if (!PIN_PATTERN.test(pin)) return false;
  const hash = await derive(pin, fromHex(record.saltHex), record.iterations);
  return sameBytes(hash, fromHex(record.hashHex));
}

/** Parses what was stored, refusing anything that is not a well-formed record. */
export function parsePinRecord(stored: unknown): PinRecord | null {
  if (typeof stored !== "string") return null;
  try {
    const value: unknown = JSON.parse(stored);
    if (value === null || typeof value !== "object") return null;
    const { saltHex, hashHex, iterations } = value as Record<string, unknown>;
    if (typeof saltHex !== "string" || !/^[0-9a-f]{32}$/.test(saltHex)) return null;
    if (typeof hashHex !== "string" || !/^[0-9a-f]{64}$/.test(hashHex)) return null;
    if (typeof iterations !== "number" || !Number.isInteger(iterations) || iterations < 10_000) return null;
    return { saltHex, hashHex, iterations };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Wrong guesses
// ---------------------------------------------------------------------------

export interface AttemptState {
  failures: number;
  /** Until when (ms since epoch) no further guess is accepted; 0 = not locked. */
  lockedUntil: number;
}

export const NO_ATTEMPTS: AttemptState = { failures: 0, lockedUntil: 0 };

/** Free guesses before the waiting begins. */
export const FREE_ATTEMPTS = 5;
/** After this many wrong guesses in a row the user is signed out and the device is wiped. */
export const MAX_FAILURES = 10;

const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 15 * 60_000;

export function afterWrongPin(state: AttemptState, now: number): AttemptState {
  const failures = state.failures + 1;
  if (failures < FREE_ATTEMPTS) return { failures, lockedUntil: 0 };
  const delay = Math.min(BASE_DELAY_MS * 2 ** (failures - FREE_ATTEMPTS), MAX_DELAY_MS);
  return { failures, lockedUntil: now + delay };
}

export function shouldWipe(state: AttemptState): boolean {
  return state.failures >= MAX_FAILURES;
}

/** Milliseconds the user still has to wait before the next guess; 0 if they may try now. */
export function waitMs(state: AttemptState, now: number): number {
  return Math.max(0, state.lockedUntil - now);
}

export function parseAttemptState(stored: unknown): AttemptState {
  if (typeof stored !== "string") return NO_ATTEMPTS;
  try {
    const value = JSON.parse(stored) as Partial<AttemptState> | null;
    const failures = Number(value?.failures);
    const lockedUntil = Number(value?.lockedUntil);
    if (!Number.isInteger(failures) || failures < 0 || !Number.isFinite(lockedUntil) || lockedUntil < 0) {
      return NO_ATTEMPTS;
    }
    return { failures, lockedUntil };
  } catch {
    return NO_ATTEMPTS;
  }
}

// ---------------------------------------------------------------------------
// When the device locks
// ---------------------------------------------------------------------------

export const IDLE_LOCK_MS = 10 * 60_000;
export const MAX_OFFLINE_DAYS = 7;

export function idleExpired(lastActivityAt: number, now: number, idleMs: number = IDLE_LOCK_MS): boolean {
  return now - lastActivityAt >= idleMs;
}

/**
 * The device has been away from the server for too long: the server could
 * have removed this user's access or suspended the account in the meantime.
 * Until the next successful synchronisation the data stays locked.
 */
export function offlineTooLong(
  lastOnlineVerifiedAt: number | null,
  now: number,
  maxDays: number = MAX_OFFLINE_DAYS,
): boolean {
  if (lastOnlineVerifiedAt === null) return false;
  return now - lastOnlineVerifiedAt > maxDays * 86_400_000;
}
