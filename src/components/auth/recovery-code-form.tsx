"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/forms/form-field";
import { FormError } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { redeemRecoveryCodeAction } from "@/lib/auth/mfa-actions";
import { initialFormState } from "@/lib/forms";

/** Fallback on the two-step challenge page for a lost authenticator. */
export function RecoveryCodeForm() {
  const t = useTranslations("mfa");
  const [state, formAction] = useActionState(redeemRecoveryCodeAction, initialFormState);

  return (
    <details className="w-full">
      <summary className="flex min-h-touch cursor-pointer items-center font-medium text-primary">
        {t("recoveryUseTitle")}
      </summary>
      <form action={formAction} className="mt-2 flex flex-col gap-4" noValidate>
        <p>{t("recoveryUseBody")}</p>
        <FormError message={state.status === "error" ? state.message : undefined} />
        <FormField
          label={t("recoveryCode")}
          name="recoveryCode"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          required
          className="font-mono uppercase"
        />
        <SubmitButton variant="outline">{t("recoveryUseSubmit")}</SubmitButton>
      </form>
    </details>
  );
}
