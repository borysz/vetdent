"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/dal";
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

  refresh();
  return { status: "success" };
}

export async function disableMfaAction(): Promise<FormState> {
  const t = await getTranslations("mfa.errors");
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const supabase = await createSupabaseServerClient();
  const factors = await supabase.auth.mfa.listFactors();
  for (const factor of factors.data?.all ?? []) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) return { status: "error", message: t("generic") };
  }

  // The session still says "fully verified"; refresh it so it matches reality.
  await supabase.auth.refreshSession();
  refresh();
  return { status: "success" };
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

  redirect(safeNextPath(field(formData, "next")));
}
