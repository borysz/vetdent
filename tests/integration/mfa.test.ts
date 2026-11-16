import { createHmac, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Two-step verification is enforced by the database: once a user has a
 * verified authenticator, a session that only passed the password step gets
 * nothing from the API. Uses a throw-away user that is deleted afterwards.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!url || !publishableKey || !secretKey) {
  throw new Error("Integration tests need the Supabase settings from .env.local.");
}

type Client = SupabaseClient<Database>;
const stateless = { auth: { persistSession: false, autoRefreshToken: false } } as const;
const admin: Client = createClient<Database>(url, secretKey, stateless);
const anonymous: Client = createClient<Database>(url, publishableKey, stateless);
const newClient = (): Client => createClient<Database>(url, publishableKey, stateless);

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(value: string): Buffer {
  let bits = "";
  for (const char of value.replace(/=+$/, "").toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 secret");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
}

/** RFC 6238 time-based one-time password (SHA-1, 6 digits, 30 s period). */
function totp(secret: string, atMs: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

const email = `itest-${randomUUID().slice(0, 8)}-mfa@vetdent.test`;
const password = `${randomUUID()}${randomUUID()}`;
let userId: string;
let organizationId: string;
let secret: string;
let factorId: string;
let firstSession: Client;

beforeAll(async () => {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  userId = created.data.user.id;

  firstSession = newClient();
  const signedIn = await firstSession.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
});

afterAll(async () => {
  if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
  if (userId) await admin.auth.admin.deleteUser(userId);
});

describe("two-step verification", () => {
  test("without an authenticator, a password session works normally", async () => {
    const { data, error } = await firstSession.rpc("create_organization", {
      p_type: "individual",
      p_name: "Dr. Teszt MFA",
    });
    expect(error).toBeNull();
    organizationId = data!;

    const organizations = await firstSession.from("organizations").select("id");
    expect(organizations.data).toHaveLength(1);
  });

  test("enrolling an authenticator fully verifies the current session", async () => {
    const enrolled = await firstSession.auth.mfa.enroll({ factorType: "totp" });
    expect(enrolled.error).toBeNull();
    factorId = enrolled.data!.id;
    secret = enrolled.data!.totp.secret;

    const verified = await firstSession.auth.mfa.challengeAndVerify({ factorId, code: totp(secret, Date.now()) });
    expect(verified.error).toBeNull();

    const organizations = await firstSession.from("organizations").select("id");
    expect(organizations.error).toBeNull();
    expect(organizations.data).toHaveLength(1);
  });

  test("a new password-only session is refused by the database", async () => {
    const passwordOnly = newClient();
    const signedIn = await passwordOnly.auth.signInWithPassword({ email, password });
    expect(signedIn.error).toBeNull();

    const read = await passwordOnly.from("organizations").select("id");
    expect(read.error?.message).toBe("mfa_required");
    expect(read.data).toBeNull();

    const write = await passwordOnly.rpc("create_organization", { p_type: "clinic", p_name: "x", p_tax_number: "1" });
    expect(write.error?.message).toBe("mfa_required");

    const members = await passwordOnly.rpc("list_members", { p_organization_id: organizationId });
    expect(members.error?.message).toBe("mfa_required");

    // After the second step, the same session is let through. The next
    // period's code is used because a code cannot be used twice.
    const verified = await passwordOnly.auth.mfa.challengeAndVerify({
      factorId,
      code: totp(secret, Date.now() + 30_000),
    });
    expect(verified.error).toBeNull();

    const after = await passwordOnly.from("organizations").select("id");
    expect(after.error).toBeNull();
    expect(after.data).toHaveLength(1);
  });

  test("recovery codes cannot be read or written through the API", async () => {
    const asUser = await firstSession.from("mfa_recovery_codes").select("id");
    expect(asUser.error).not.toBeNull();

    const forged = await firstSession.from("mfa_recovery_codes").insert({ user_id: userId, code_hash: "x" });
    expect(forged.error).not.toBeNull();

    const asAnonymous = await anonymous.from("mfa_recovery_codes").select("id");
    expect(asAnonymous.error).not.toBeNull();
  });

  test("visitors who are not signed in are unaffected", async () => {
    const { error } = await anonymous.rpc("get_invitation", { p_token: "0".repeat(64) });
    expect(error).toBeNull();
  });
});

describe("member list", () => {
  test("the owner sees members with their e-mail addresses", async () => {
    const { data, error } = await firstSession.rpc("list_members", { p_organization_id: organizationId });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data?.[0]).toMatchObject({ user_id: userId, email, role: "owner", status: "active" });
  });

  test("an outsider gets an empty list", async () => {
    const outsiderEmail = `itest-${randomUUID().slice(0, 8)}-out@vetdent.test`;
    const outsiderPassword = `${randomUUID()}${randomUUID()}`;
    const created = await admin.auth.admin.createUser({
      email: outsiderEmail,
      password: outsiderPassword,
      email_confirm: true,
    });
    expect(created.error).toBeNull();

    try {
      const outsider = newClient();
      await outsider.auth.signInWithPassword({ email: outsiderEmail, password: outsiderPassword });
      const { data, error } = await outsider.rpc("list_members", { p_organization_id: organizationId });
      expect(error).toBeNull();
      expect(data).toEqual([]);
    } finally {
      await admin.auth.admin.deleteUser(created.data!.user!.id);
    }
  });
});
