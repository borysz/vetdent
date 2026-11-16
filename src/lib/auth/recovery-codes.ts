import "server-only";
import {
  createRecoveryCode,
  hashRecoveryCode,
  isRecoveryCodeShaped,
  RECOVERY_CODE_COUNT,
} from "@/lib/auth/recovery-code-format";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Storage of two-step verification recovery codes. The table is closed to
 * users, so this module uses the secret-key client. Callers MUST pass a user
 * id that comes from a verified session – never from a form.
 */

/** Replaces the user's recovery codes and returns the new ones (shown once). */
export async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, createRecoveryCode);

  const removed = await admin.from("mfa_recovery_codes").delete().eq("user_id", userId);
  if (removed.error) throw new Error(`Could not replace recovery codes: ${removed.error.message}`);

  const inserted = await admin
    .from("mfa_recovery_codes")
    .insert(codes.map((code) => ({ user_id: userId, code_hash: hashRecoveryCode(code) })));
  if (inserted.error) throw new Error(`Could not store recovery codes: ${inserted.error.message}`);

  return codes;
}

export async function deleteRecoveryCodes(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("mfa_recovery_codes").delete().eq("user_id", userId);
  if (error) throw new Error(`Could not delete recovery codes: ${error.message}`);
}

/**
 * Marks the code as used if it is valid and unused. The update is atomic, so
 * a code can never be consumed twice, even by concurrent requests.
 */
export async function consumeRecoveryCode(userId: string, input: string): Promise<boolean> {
  if (!isRecoveryCodeShaped(input)) return false;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("mfa_recovery_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("code_hash", hashRecoveryCode(input))
    .is("used_at", null)
    .select("id");
  if (error) throw new Error(`Could not check recovery code: ${error.message}`);

  return data.length === 1;
}

/** Removes every authenticator of the user (after a recovery code was accepted). */
export async function removeAllFactors(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error) throw new Error(`Could not list authenticators: ${error.message}`);

  for (const factor of data.factors) {
    const removed = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
    if (removed.error) throw new Error(`Could not remove authenticator: ${removed.error.message}`);
  }
}
