"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { logAuthEvent } from "@/lib/audit/log-auth-event";
import { getCurrentUser, requireUser } from "@/lib/auth/dal";
import {
  consumeRecoveryCode,
  deleteRecoveryCodes,
  issueRecoveryCodes,
  removeAllFactors,
} from "@/lib/auth/recovery-codes";
import { field, type FormState } from "@/lib/forms";
import { routes, safeNextPath } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CODE_PATTERN = /^\d{6}$/;

/**
 * Two-step verification with an authenticator app (TOTP).
 *
 * These actions only need a signed-in user, not a fully verified one: the
 * challenge is exactly how a session becomes fully verified.
 */

/** Starts enrolment and returns the QR code and secret to show once. */
export async function startMfaEnrollmentAction(): Promise<FormState> {
  const t = await getTranslations("mfa.errors");
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const supabase = await createSupabaseServerClient();

  // Drop half-finished attempts, so a new QR code can always be issued.
  const existing = await supabase.auth.mfa.listFactors();
  for (const factor of existing.data?.all ?? []) {
    if (factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `VetDent ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) return { status: "error", message: t("generic") };

  return {
    status: "success",
    data: { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret },
  };
}

/** Confirms enrolment with the first code from the app; the session becomes fully verified. */
export async function confirmMfaEnrollmentAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("mfa.errors");
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const factorId = field(formData, "factorId");
  const code = field(formData, "code").replace(/\s/g, "");
  if (!CODE_PATTERN.test(code)) return { status: "error", message: t("codeFormat") };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { status: "error", message: t("codeInvalid") };

  // Shown exactly once, right after switching two-step verification on.
  const codes = await issueRecoveryCodes(user.id);
  await logAuthEvent(supabase, "auth.mfa_enabled");

  refresh();
  return { status: "success", data: { codes: codes.join("\n") } };
}

/** Replaces the recovery codes; the old ones stop working. Needs a fully verified session. */
export async function regenerateRecoveryCodesAction(): Promise<FormState> {
  const t = await getTranslations("mfa.errors");
  const user = await requireUser();

  const supabase = await createSupabaseServerClient();
  const factors = await supabase.auth.mfa.listFactors();
  if ((factors.data?.totp.length ?? 0) === 0) return { status: "error", message: t("generic") };

  const codes = await issueRecoveryCodes(user.id);
  return { status: "success", data: { codes: codes.join("\n") } };
}

export async function disableMfaAction(): Promise<FormState> {
  const t = await getTranslations("mfa.errors");
  const user = await requireUser();

  const supabase = await createSupabaseServerClient();
  const factors = await supabase.auth.mfa.listFactors();
  for (const factor of factors.data?.all ?? []) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) return { status: "error", message: t("generic") };
  }
  await deleteRecoveryCodes(user.id);
  await logAuthEvent(supabase, "auth.mfa_disabled");

  // The session still says "fully verified"; refresh it so it matches reality.
  await supabase.auth.refreshSession();
  refresh();
  return { status: "success" };
}

/**
 * Lost authenticator: a recovery code switches two-step verification off for
 * the account, so the user can sign in with the password and set it up again.
 * Each code works once.
 */
export async function redeemRecoveryCodeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("mfa.errors");
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (!user.mfaPending) redirect(routes.app);

  // `user.id` comes from the verified session token, never from the form.
  const accepted = await consumeRecoveryCode(user.id, field(formData, "recoveryCode"));
  if (!accepted) return { status: "error", message: t("recoveryInvalid") };

  await removeAllFactors(user.id);
  await deleteRecoveryCodes(user.id);

  const supabase = await createSupabaseServerClient();
  await supabase.auth.refreshSession();
  await logAuthEvent(supabase, "auth.recovery_code_used");
  redirect(routes.profile);
}

/** Second step of sign-in: verifies a code and continues to the requested page. */
export async function verifyMfaChallengeAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("mfa.errors");
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const code = field(formData, "code").replace(/\s/g, "");
  if (!CODE_PATTERN.test(code)) return { status: "error", message: t("codeFormat") };

  const supabase = await createSupabaseServerClient();
  const factors = await supabase.auth.mfa.listFactors();
  const factor = factors.data?.totp[0];
  if (!factor) redirect(routes.app);

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { status: "error", message: t("codeInvalid") };

  await logAuthEvent(supabase, "auth.sign_in");
  redirect(safeNextPath(field(formData, "next")));
}
