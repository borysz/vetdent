"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { ActionForm } from "@/components/forms/action-form";
import { FormField } from "@/components/forms/form-field";
import { FormError } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import {
  confirmMfaEnrollmentAction,
  disableMfaAction,
  regenerateRecoveryCodesAction,
  startMfaEnrollmentAction,
} from "@/lib/auth/mfa-actions";
import { initialFormState } from "@/lib/forms";
import { changePasswordAction, updateProfileAction } from "@/lib/profile/actions";

const successClass = "text-sm text-success";

export function ProfileDetailsForm({ fullName, title }: { fullName: string; title: string }) {
  const t = useTranslations();
  const [state, formAction] = useActionState(updateProfileAction, initialFormState);

  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
        <FormField
          label={t("profile.titleField")}
          labelSuffix={t("common.optional")}
          name="title"
          autoComplete="honorific-prefix"
          hint={t("profile.titleHint")}
          defaultValue={values?.title ?? title}
          error={errors?.title}
        />
        <FormField
          label={t("auth.fields.fullName")}
          name="fullName"
          autoComplete="name"
          required
          defaultValue={values?.fullName ?? fullName}
          error={errors?.fullName}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton>{t("profile.save")}</SubmitButton>
        {state.status === "success" ? (
          <p role="status" className={successClass}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const t = useTranslations();
  const [state, formAction] = useActionState(changePasswordAction, initialFormState);

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <FormField
        label={t("auth.fields.newPassword")}
        name="password"
        type="password"
        autoComplete="new-password"
        required
        hint={t("auth.fields.passwordHint")}
        error={state.status === "error" ? state.fieldErrors?.password : undefined}
      />
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton>{t("profile.passwordSubmit")}</SubmitButton>
        {state.status === "success" ? (
          <p role="status" className={successClass}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** One-time display of freshly issued recovery codes. */
function RecoveryCodes({ codes }: { codes: string }) {
  const t = useTranslations("mfa");
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-xl border border-warning bg-warning-soft p-4">
      <h3 className="font-semibold">{t("recoveryTitle")}</h3>
      <p className="mt-1 text-sm">{t("recoveryBody")}</p>
      <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-base select-all sm:max-w-sm">
        {codes.split("\n").map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        className="mt-3 bg-card"
        onClick={async () => {
          await navigator.clipboard.writeText(codes);
          setCopied(true);
        }}
      >
        {copied ? t("recoveryCopied") : t("recoveryCopy")}
      </Button>
    </div>
  );
}

/** Switches two-step verification on (QR code, then first code) or off. */
export function MfaSettings({ enabled }: { enabled: boolean }) {
  const t = useTranslations("mfa");
  const [enrollment, startEnrollment] = useActionState(startMfaEnrollmentAction, initialFormState);
  const [confirmation, confirmEnrollment] = useActionState(confirmMfaEnrollmentAction, initialFormState);
  const [regeneration, regenerate] = useActionState(regenerateRecoveryCodesAction, initialFormState);

  if (enabled) {
    // Codes exist in the browser only right after they were issued.
    const issued =
      (regeneration.status === "success" ? regeneration.data?.codes : undefined) ??
      (confirmation.status === "success" ? confirmation.data?.codes : undefined);

    return (
      <div className="flex flex-col gap-4">
        <p>{t("onBody")}</p>
        {issued ? <RecoveryCodes codes={issued} /> : null}
        <div className="flex flex-wrap items-start gap-3">
          <form
            action={regenerate}
            onSubmit={(event) => {
              if (!window.confirm(t("recoveryRegenerateConfirm"))) event.preventDefault();
            }}
          >
            <SubmitButton variant="outline">{t("recoveryRegenerate")}</SubmitButton>
          </form>
          <ActionForm action={disableMfaAction} confirmMessage={t("disableConfirm")} className="flex flex-wrap gap-3">
            <SubmitButton variant="outline">{t("disable")}</SubmitButton>
          </ActionForm>
        </div>
        <FormError message={regeneration.status === "error" ? regeneration.message : undefined} />
      </div>
    );
  }

  const pending = enrollment.status === "success" ? enrollment.data : undefined;

  if (!pending) {
    return (
      <form action={startEnrollment} className="flex flex-col gap-4">
        <p>{t("offBody")}</p>
        <FormError message={enrollment.status === "error" ? enrollment.message : undefined} />
        <div>
          <SubmitButton>{t("start")}</SubmitButton>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p>{t("scan")}</p>
      {/* The QR code is an inline SVG data URL from the auth server; next/image cannot optimise it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={pending.qrCode} alt={t("qrAlt")} width={200} height={200} className="rounded-lg border bg-white p-2" />
      <p className="text-sm text-muted-foreground">
        {t("secretLabel")} <span className="font-mono break-all text-foreground select-all">{pending.secret}</span>
      </p>
      <form action={confirmEnrollment} className="flex flex-col gap-4" noValidate>
        <FormError message={confirmation.status === "error" ? confirmation.message : undefined} />
        <input type="hidden" name="factorId" value={pending.factorId} />
        <div className="max-w-56">
          <FormField
            label={t("code")}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            className="text-center font-mono text-xl tracking-[0.4em]"
          />
        </div>
        <div>
          <SubmitButton>{t("confirm")}</SubmitButton>
        </div>
      </form>
    </div>
  );
}
