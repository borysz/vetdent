"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/forms/form-field";
import { FormError } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { verifyMfaChallengeAction } from "@/lib/auth/mfa-actions";
import { initialFormState } from "@/lib/forms";

export function MfaChallengeForm() {
  const t = useTranslations("mfa");
  const searchParams = useSearchParams();
  const [state, formAction] = useActionState(verifyMfaChallengeAction, initialFormState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <input type="hidden" name="next" value={searchParams.get("next") ?? ""} />
      <FormField
        label={t("code")}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        required
        autoFocus
        className="text-center font-mono text-xl tracking-[0.4em]"
      />
      <SubmitButton size="lg">{t("challengeSubmit")}</SubmitButton>
    </form>
  );
}
