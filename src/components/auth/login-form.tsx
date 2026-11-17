"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/forms/form-field";
import { FormError } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { signInAction } from "@/lib/auth/actions";
import { initialFormState } from "@/lib/forms";

/** `invitedEmail`: the address an invitation was sent to; it is filled in and cannot be changed. */
export function LoginForm({ invitedEmail }: { invitedEmail?: string | null }) {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const [state, formAction] = useActionState(signInAction, initialFormState);

  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;
  // Shown when an e-mail link turned out to be invalid or expired.
  const linkError = searchParams.get("hiba") === "hivatkozas" ? t("errors.linkInvalid") : undefined;
  const formError = state.status === "error" ? state.message : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={formError ?? (state.status === "idle" ? linkError : undefined)} />
      <input type="hidden" name="next" value={searchParams.get("next") ?? ""} />
      <FormField
        label={t("fields.email")}
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        readOnly={Boolean(invitedEmail)}
        defaultValue={invitedEmail ?? values?.email}
        hint={invitedEmail ? t("fields.invitedEmailHint") : undefined}
        error={errors?.email}
      />
      <FormField
        label={t("fields.password")}
        name="password"
        type="password"
        autoComplete="current-password"
        required
        error={errors?.password}
      />
      <SubmitButton size="lg">{t("login.submit")}</SubmitButton>
    </form>
  );
}
