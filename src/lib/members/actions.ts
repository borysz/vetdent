"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { ACTIVE_ORGANIZATION_COOKIE, requireActiveMembership, requireUser } from "@/lib/auth/dal";
import { INVITABLE_ROLES, MEMBER_ROLES } from "@/lib/auth/roles";
import { dbErrorKey } from "@/lib/db-errors";
import { publicEnv } from "@/lib/env";
import { field, type FormState } from "@/lib/forms";
import { invitationPath, routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
  role: z.enum(INVITABLE_ROLES),
});

const uuid = z.uuid();

/**
 * Creates an invitation for the organization the user is working in. The
 * organization always comes from the server-side session, never from the form.
 */
export async function inviteMemberAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await requireActiveMembership();
  const t = await getTranslations();
  const values = { email: field(formData, "email"), role: field(formData, "role") };

  const parsed = inviteSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === "email") fieldErrors.email = t("members.validation.emailInvalid");
      if (issue.path[0] === "role") fieldErrors.role = t("members.validation.roleInvalid");
    }
    return { status: "error", fieldErrors, values };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_invitation", {
    p_organization_id: membership.organization.id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
  });

  const invitation = data?.[0];
  if (error || !invitation) {
    return { status: "error", message: t(`dbErrors.${dbErrorKey(error ?? {})}`), values };
  }

  refresh();
  return {
    status: "success",
    data: {
      email: parsed.data.email,
      link: new URL(invitationPath(invitation.token), publicEnv.NEXT_PUBLIC_APP_URL).toString(),
    },
  };
}

export async function revokeInvitationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireActiveMembership();
  const t = await getTranslations("dbErrors");

  const invitationId = uuid.safeParse(field(formData, "invitationId"));
  if (!invitationId.success) return { status: "error", message: t("invitation_not_found") };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_invitation", { p_invitation_id: invitationId.data });
  if (error) return { status: "error", message: t(dbErrorKey(error)) };

  refresh();
  return { status: "success" };
}

export async function updateMemberAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireActiveMembership();
  const t = await getTranslations("dbErrors");

  const membershipId = uuid.safeParse(field(formData, "membershipId"));
  const role = z.enum(MEMBER_ROLES).safeParse(field(formData, "role"));
  if (!membershipId.success || !role.success) return { status: "error", message: t("member_not_found") };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("update_member", {
    p_membership_id: membershipId.data,
    p_role: role.data,
    p_is_clinician: field(formData, "isClinician") === "on",
  });
  if (error) return { status: "error", message: t(dbErrorKey(error)) };

  refresh();
  return { status: "success" };
}

export async function setMemberStatusAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireActiveMembership();
  const t = await getTranslations("dbErrors");

  const membershipId = uuid.safeParse(field(formData, "membershipId"));
  const status = z.enum(["active", "suspended"]).safeParse(field(formData, "status"));
  if (!membershipId.success || !status.success) return { status: "error", message: t("member_not_found") };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_member_status", {
    p_membership_id: membershipId.data,
    p_status: status.data,
  });
  if (error) return { status: "error", message: t(dbErrorKey(error)) };

  refresh();
  return { status: "success" };
}

/** Removes a member, or lets the signed-in user leave the organization. */
export async function removeMemberAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { membership } = await requireActiveMembership();
  const t = await getTranslations("dbErrors");

  const membershipId = uuid.safeParse(field(formData, "membershipId"));
  if (!membershipId.success) return { status: "error", message: t("member_not_found") };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("remove_member", { p_membership_id: membershipId.data });
  if (error) return { status: "error", message: t(dbErrorKey(error)) };

  // Leaving: the user no longer belongs here, so start over from the app entry.
  if (membershipId.data === membership.id) {
    (await cookies()).delete(ACTIVE_ORGANIZATION_COOKIE);
    redirect(routes.app);
  }

  refresh();
  return { status: "success" };
}

/** Accepts an invitation as the signed-in user and switches to that organization. */
export async function acceptInvitationAction(_previous: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const t = await getTranslations("dbErrors");

  const token = field(formData, "token");
  if (!/^[0-9a-f]{64}$/.test(token)) return { status: "error", message: t("invitation_not_found") };

  const supabase = await createSupabaseServerClient();
  const { data: organizationId, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error || !organizationId) return { status: "error", message: t(dbErrorKey(error ?? {})) };

  (await cookies()).set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect(routes.app);
}
