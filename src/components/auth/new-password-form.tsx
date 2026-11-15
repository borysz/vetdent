"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/forms/form-field";
import { FormError } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { updatePasswordAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/forms";

export function NewPasswordForm() {
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(updatePasswordAction, initialFormState);

  const errors = state.status === "error" ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <FormField
        label={t("fields.newPassword")}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint={t("fields.passwordHint")}
        error={errors?.password}
      />
      <SubmitButton size="lg">{t("newPassword.submit")}</SubmitButton>
    </form>
  );
}
