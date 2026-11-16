"use server";

import { refresh } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { authErrorKey } from "@/lib/auth/errors";
import { newPasswordSchema, type AuthValidationKey } from "@/lib/auth/schemas";
import { field, fieldErrorsFrom, type FormState } from "@/lib/forms";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ProfileValidationKey = "fullNameRequired" | "tooLong";

const profileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "fullNameRequired" satisfies ProfileValidationKey)
    .max(200, "tooLong" satisfies ProfileValidationKey),
  title: z
    .string()
    .trim()
    .max(50, "tooLong" satisfies ProfileValidationKey),
});

export async function updateProfileAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const t = await getTranslations("profile");
  const values = { fullName: field(formData, "fullName"), title: field(formData, "title") };

  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrorsFrom<ProfileValidationKey>(parsed.error, (key) => t(`validation.${key}`)),
      values,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.fullName, title: parsed.data.title || null })
    .eq("id", user.id);

  if (error) {
    const tErrors = await getTranslations("dbErrors");
    return { status: "error", message: tErrors("unknown"), values };
  }

  refresh();
  return { status: "success", message: t("saved") };
}

export async function changePasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const t = await getTranslations();

  const parsed = newPasswordSchema.safeParse({ password: field(formData, "password") });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrorsFrom<AuthValidationKey>(parsed.error, (key) => t(`auth.validation.${key}`)),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { status: "error", message: t(`auth.errors.${authErrorKey(error)}`) };
  }

  return { status: "success", message: t("profile.passwordSaved") };
}

/** Ends every session of the user except the current one. */
export async function signOutOtherSessionsAction(): Promise<FormState> {
  await requireUser();
  const t = await getTranslations();

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) {
    return { status: "error", message: t(`auth.errors.${authErrorKey(error)}`) };
  }

  return { status: "success", message: t("profile.signedOutOthers") };
}
