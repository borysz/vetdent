"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/forms/form-field";
import { FormError, FormSuccess } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { INVITABLE_ROLES } from "@/lib/auth/roles";
import { initialFormState } from "@/lib/forms";
import { inviteMemberAction } from "@/lib/members/actions";

export function InviteForm() {
  const t = useTranslations();
  const [state, formAction] = useActionState(inviteMemberAction, initialFormState);
  const [copied, setCopied] = useState(false);

  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;
  const created = state.status === "success" ? state.data : undefined;

  return (
    <div className="flex flex-col gap-5">
      {created ? (
        <FormSuccess title={t("members.inviteCreatedTitle")}>
          <p>{t("members.inviteCreatedBody", { email: created.email })}</p>
          <p className="mt-2 rounded-lg border bg-card p-3 font-mono text-sm break-all select-all">{created.link}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={async () => {
              await navigator.clipboard.writeText(created.link);
              setCopied(true);
            }}
          >
            {copied ? t("members.copied") : t("members.copy")}
          </Button>
        </FormSuccess>
      ) : null}

      <form
        action={formAction}
        onSubmit={() => setCopied(false)}
        className="grid items-start gap-5 sm:grid-cols-[1fr_14rem_auto]"
        noValidate
      >
        <div className="sm:col-span-3">
          <FormError message={state.status === "error" ? state.message : undefined} />
        </div>
        <FormField
          label={t("auth.fields.email")}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={values?.email}
          error={errors?.email}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-role">{t("members.roleLabel")}</Label>
          <select
            id="invite-role"
            name="role"
            defaultValue={values?.role ?? "vet"}
            className="h-touch rounded-lg border border-input bg-card px-3 text-base"
          >
            {INVITABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {t(`roles.${role}`)}
              </option>
            ))}
          </select>
          {errors?.role ? <p className="text-sm text-destructive">{errors.role}</p> : null}
        </div>
        <SubmitButton className="sm:mt-[1.625rem]">{t("members.inviteSubmit")}</SubmitButton>
      </form>
    </div>
  );
}
