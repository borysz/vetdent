"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/forms/form-field";
import { FormError, FormSuccess } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { requestPasswordResetAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/forms";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(requestPasswordResetAction, initialFormState);

  if (state.status === "success") {
    return <FormSuccess title={t("forgot.sentTitle")}>{t("forgot.sentBody")}</FormSuccess>;
  }

  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <FormField
        label={t("fields.email")}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        defaultValue={values?.email}
        error={errors?.email}
      />
      <SubmitButton size="lg">{t("forgot.submit")}</SubmitButton>
    </form>
  );
}
