"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/forms/form-field";
import { FormError, FormSuccess } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { signUpAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/forms";

export function SignUpForm() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const [state, formAction] = useActionState(signUpAction, initialFormState);

  if (state.status === "success") {
    return <FormSuccess title={t("signUp.checkEmailTitle")}>{t("signUp.checkEmailBody")}</FormSuccess>;
  }

  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <input type="hidden" name="next" value={searchParams.get("next") ?? ""} />
      <FormField
        label={t("fields.fullName")}
        name="fullName"
        autoComplete="name"
        required
        defaultValue={values?.fullName}
        error={errors?.fullName}
      />
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
      <FormField
        label={t("fields.password")}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint={t("fields.passwordHint")}
        error={errors?.password}
      />
      <SubmitButton size="lg">{t("signUp.submit")}</SubmitButton>
    </form>
  );
}
