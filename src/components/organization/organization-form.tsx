"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { FormField } from "@/components/forms/form-field";
import { FormError } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { initialFormState } from "@/lib/forms";
import { updateOrganizationAction } from "@/lib/organizations/actions";

export interface OrganizationDetails {
  type: "clinic" | "individual";
  name: string;
  taxNumber: string;
  postalCode: string;
  city: string;
  addressLine: string;
  phone: string;
}

/** Contact and billing details of the organization; read-only unless `editable`. */
export function OrganizationForm({ details, editable }: { details: OrganizationDetails; editable: boolean }) {
  const t = useTranslations();
  const [state, formAction] = useActionState(updateOrganizationAction, initialFormState);

  const errors = state.status === "error" ? state.fieldErrors : undefined;
  const values = state.status === "error" ? state.values : undefined;
  const clinic = details.type === "clinic";
  const optional = t("common.optional");

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <FormField
        label={t(clinic ? "onboarding.fields.clinicName" : "onboarding.fields.individualName")}
        name="name"
        required
        readOnly={!editable}
        defaultValue={values?.name ?? details.name}
        error={errors?.name}
      />
      <FormField
        label={t("onboarding.fields.taxNumber")}
        labelSuffix={clinic ? undefined : optional}
        name="taxNumber"
        required={clinic}
        readOnly={!editable}
        defaultValue={values?.taxNumber ?? details.taxNumber}
        error={errors?.taxNumber}
      />
      <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
        <FormField
          label={t("onboarding.fields.postalCode")}
          labelSuffix={optional}
          name="postalCode"
          inputMode="numeric"
          readOnly={!editable}
          defaultValue={values?.postalCode ?? details.postalCode}
          error={errors?.postalCode}
        />
        <FormField
          label={t("onboarding.fields.city")}
          labelSuffix={optional}
          name="city"
          readOnly={!editable}
          defaultValue={values?.city ?? details.city}
          error={errors?.city}
        />
      </div>
      <FormField
        label={t("onboarding.fields.addressLine")}
        labelSuffix={optional}
        name="addressLine"
        readOnly={!editable}
        defaultValue={values?.addressLine ?? details.addressLine}
        error={errors?.addressLine}
      />
      <FormField
        label={t("onboarding.fields.phone")}
        labelSuffix={optional}
        name="phone"
        type="tel"
        readOnly={!editable}
        defaultValue={values?.phone ?? details.phone}
        error={errors?.phone}
      />
      {editable ? (
        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton>{t("organization.save")}</SubmitButton>
          {state.status === "success" ? (
            <p role="status" className="text-sm text-success">
              {state.message}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground">{t("organization.readOnlyNote")}</p>
      )}
    </form>
  );
}
