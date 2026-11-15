"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/auth/dal";
import { authErrorKey } from "@/lib/auth/errors";
import {
  forgotPasswordSchema,
  loginSchema,
  newPasswordSchema,
  signUpSchema,
  type AuthValidationKey,
} from "@/lib/auth/schemas";
import { publicEnv } from "@/lib/env";
import { field, fieldErrorsFrom, type FormState } from "@/lib/forms";
import { routes, safeNextPath } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Absolute URL of the auth callback that continues to `next` after the e-mail link. */
function callbackUrl(next: string): string {
  const url = new URL(routes.authCallback, publicEnv.NEXT_PUBLIC_APP_URL);
  url.searchParams.set("next", next);
  return url.toString();
}

export async function signInAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("auth");
  const values = { email: field(formData, "email") };

  const parsed = loginSchema.safeParse({ email: values.email, password: field(formData, "password") });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrorsFrom<AuthValidationKey>(parsed.error, (key) => t(`validation.${key}`)),
      values,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { status: "error", message: t(`errors.${authErrorKey(error)}`), values };
  }

  redirect(safeNextPath(field(formData, "next")));
}

export async function signUpAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("auth");
  const values = { fullName: field(formData, "fullName"), email: field(formData, "email") };

  const parsed = signUpSchema.safeParse({ ...values, password: field(formData, "password") });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrorsFrom<AuthValidationKey>(parsed.error, (key) => t(`validation.${key}`)),
      values,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: callbackUrl(routes.onboarding),
    },
  });

  if (error) {
    // An already registered address gets the same answer as a new one, so the
    // form cannot be used to find out who has an account.
    if (error.code !== "user_already_exists") {
      return { status: "error", message: t(`errors.${authErrorKey(error)}`), values };
    }
  }

  // If e-mail confirmation is switched off in the project, we are signed in already.
  if (data.session) {
    redirect(routes.onboarding);
  }

  return { status: "success" };
}

export async function requestPasswordResetAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("auth");
  const values = { email: field(formData, "email") };

  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrorsFrom<AuthValidationKey>(parsed.error, (key) => t(`validation.${key}`)),
      values,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: callbackUrl(routes.newPassword),
  });

  // Only rate limiting is reported; everything else looks like success, so the
  // form does not reveal whether an address is registered.
  if (error && authErrorKey(error) === "rateLimited") {
    return { status: "error", message: t("errors.rateLimited"), values };
  }

  return { status: "success" };
}

export async function updatePasswordAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const t = await getTranslations("auth");

  const parsed = newPasswordSchema.safeParse({ password: field(formData, "password") });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrorsFrom<AuthValidationKey>(parsed.error, (key) => t(`validation.${key}`)),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return { status: "error", message: t("errors.linkInvalid") };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { status: "error", message: t(`errors.${authErrorKey(error)}`) };
  }

  redirect(routes.app);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  (await cookies()).delete(ACTIVE_ORGANIZATION_COOKIE);
  redirect(routes.login);
}
