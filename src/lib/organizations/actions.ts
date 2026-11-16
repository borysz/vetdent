"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ACTIVE_ORGANIZATION_COOKIE, getMemberships, requireActiveMembership, requireUser } from "@/lib/auth/dal";
import { dbErrorKey } from "@/lib/db-errors";
import { field, fieldErrorsFrom, type FormState } from "@/lib/forms";
import { createOrganizationSchema, type OrganizationValidationKey } from "@/lib/organizations/schemas";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function rememberActiveOrganization(organizationId: string): Promise<void> {
  (await cookies()).set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function createOrganizationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const t = await getTranslations();

  const values = {
    type: field(formData, "type"),
    name: field(formData, "name"),
    taxNumber: field(formData, "taxNumber"),
    postalCode: field(formData, "postalCode"),
    city: field(formData, "city"),
    addressLine: field(formData, "addressLine"),
    phone: field(formData, "phone"),
    ownerIsClinician: field(formData, "ownerIsClinician") === "on" ? "on" : "",
  };

  const parsed = createOrganizationSchema.safeParse({
    ...values,
    ownerIsClinician: values.ownerIsClinician === "on",
  });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrorsFrom<OrganizationValidationKey>(parsed.error, (key) =>
        t(`onboarding.validation.${key}`),
      ),
      values,
    };
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data: organizationId, error } = await supabase.rpc("create_organization", {
    p_type: input.type,
    p_name: input.name,
    p_tax_number: input.taxNumber,
    p_postal_code: input.postalCode,
    p_city: input.city,
    p_address_line: input.addressLine,
    p_phone: input.phone,
    p_owner_is_clinician: input.ownerIsClinician,
  });

  if (error || !organizationId) {
    return { status: "error", message: t(`dbErrors.${dbErrorKey(error ?? {})}`), values };
  }

  await rememberActiveOrganization(organizationId);
  redirect(routes.app);
}

/**
 * Updates the contact and billing details of the organization the user is
 * working in. Row level security only lets owners and admins through.
 */
export async function updateOrganizationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await requireActiveMembership();
  const t = await getTranslations();

  const values = {
    name: field(formData, "name"),
    taxNumber: field(formData, "taxNumber"),
    postalCode: field(formData, "postalCode"),
    city: field(formData, "city"),
    addressLine: field(formData, "addressLine"),
    phone: field(formData, "phone"),
  };

  // Same rules as at creation; the type is fixed and comes from the session.
  const parsed = createOrganizationSchema.safeParse({
    ...values,
    type: membership.organization.type,
    ownerIsClinician: false,
  });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrorsFrom<OrganizationValidationKey>(parsed.error, (key) =>
        t(`onboarding.validation.${key}`),
      ),
      values,
    };
  }

  const input = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .update({
      name: input.name,
      tax_number: input.taxNumber || null,
      postal_code: input.postalCode || null,
      city: input.city || null,
      address_line: input.addressLine || null,
      phone: input.phone || null,
    })
    .eq("id", membership.organization.id)
    .select("id");

  if (error) {
    return { status: "error", message: t("dbErrors.unknown"), values };
  }
  // No row came back: row level security filtered the update out.
  if (data.length === 0) {
    return { status: "error", message: t("dbErrors.forbidden"), values };
  }

  refresh();
  return { status: "success", message: t("organization.saved") };
}

/** Switches the organization the user is working in. Ignores ids the user is not a member of. */
export async function switchOrganizationAction(formData: FormData): Promise<void> {
  await requireUser();
  const organizationId = field(formData, "organizationId");

  const memberships = await getMemberships();
  if (memberships.some((membership) => membership.organization.id === organizationId)) {
    await rememberActiveOrganization(organizationId);
  }

  redirect(routes.app);
}
