"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/forms/form-field";
import { FormError } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialFormState } from "@/lib/forms";
import { createOrganizationAction } from "@/lib/organizations/actions";

const ACCOUNT_TYPES = ["clinic", "individual"] as const;
type AccountType = (typeof ACCOUNT_TYPES)[number];

const isAccountType = (value: string | undefined): value is AccountType =>
  value !== undefined && (ACCOUNT_TYPES as readonly string[]).includes(value);

/**
 * First step after registration: choose between a clinic and an individual
 * veterinarian account and enter its billing details.
 */
export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const t = useTranslations("onboarding");
  const tCommon = useTranslations("common");
  const [state, formAction] = useActionState(createOrganizationAction, initialFormState);

  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;
  // React resets the form after every submission. The radios are therefore
  // uncontrolled, with the submitted type as their default, so the reset
  // restores the selection instead of clearing it; `type` only drives which
  // fields are shown.
  const submittedType = isAccountType(values?.type) ? values.type : null;
  const [type, setType] = useState<AccountType | null>(submittedType);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">{t("typeLegend")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {ACCOUNT_TYPES.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer flex-col gap-1 rounded-xl border-2 border-border bg-card p-4 has-checked:border-primary has-checked:bg-accent has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <span className="flex items-center gap-3">
                <input
                  type="radio"
                  name="type"
                  value={option}
                  defaultChecked={submittedType === option}
                  onChange={() => setType(option)}
                  className="size-5 accent-primary"
                />
                <span className="text-lg font-semibold">{t(`types.${option}.title`)}</span>
              </span>
              <span className="text-muted-foreground">{t(`types.${option}.body`)}</span>
            </label>
          ))}
        </div>
        {errors?.type ? <p className="text-sm text-destructive">{errors.type}</p> : null}
      </fieldset>

      {type ? (
        <>
          <FormField
            // Re-mount when the type changes, so the right default name applies.
            key={type}
            label={t(type === "clinic" ? "fields.clinicName" : "fields.individualName")}
            name="name"
            autoComplete={type === "clinic" ? "organization" : "name"}
            required
            defaultValue={values?.name ?? (type === "individual" ? defaultName : "")}
            error={errors?.name}
          />
          <FormField
            label={t("fields.taxNumber")}
            labelSuffix={type === "individual" ? tCommon("optional") : undefined}
            name="taxNumber"
            required={type === "clinic"}
            defaultValue={values?.taxNumber}
            error={errors?.taxNumber}
          />
          <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
            <FormField
              label={t("fields.postalCode")}
              labelSuffix={tCommon("optional")}
              name="postalCode"
              autoComplete="postal-code"
              inputMode="numeric"
              defaultValue={values?.postalCode}
              error={errors?.postalCode}
            />
            <FormField
              label={t("fields.city")}
              labelSuffix={tCommon("optional")}
              name="city"
              autoComplete="address-level2"
              defaultValue={values?.city}
              error={errors?.city}
            />
          </div>
          <FormField
            label={t("fields.addressLine")}
            labelSuffix={tCommon("optional")}
            name="addressLine"
            autoComplete="street-address"
            defaultValue={values?.addressLine}
            error={errors?.addressLine}
          />
          <FormField
            label={t("fields.phone")}
            labelSuffix={tCommon("optional")}
            name="phone"
            type="tel"
            autoComplete="tel"
            defaultValue={values?.phone}
            error={errors?.phone}
          />

          {type === "clinic" ? (
            <label className="flex min-h-touch cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                name="ownerIsClinician"
                defaultChecked={values?.ownerIsClinician === "on"}
                className="mt-0.5 size-5 accent-primary"
              />
              <span className="flex flex-col">
                <span className="font-medium">{t("fields.ownerIsClinician")}</span>
                <span className="text-sm text-muted-foreground">{t("fields.ownerIsClinicianHint")}</span>
              </span>
            </label>
          ) : null}

          <SubmitButton size="lg">{t("submit")}</SubmitButton>
        </>
      ) : null}
    </form>
  );
}
