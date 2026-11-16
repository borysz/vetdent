import type { Metadata } from "next";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { InviteForm } from "@/components/members/invite-form";
import { requireActiveMembership } from "@/lib/auth/dal";
import { assignableRoles, canManageMember, isManager, type MemberRole } from "@/lib/auth/roles";
import {
  removeMemberAction,
  revokeInvitationAction,
  setMemberStatusAction,
  updateMemberAction,
} from "@/lib/members/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("members");
  return { title: t("title") };
}

export default function MembersPage() {
  const t = useTranslations();

  return (
    <>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("members.title")}</h1>
        <p className="mt-1 text-lg text-muted-foreground">{t("members.lead")}</p>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">{t("common.loading")}</p>}>
        <MembersContent />
      </Suspense>
    </>
  );
}

const selectClass = "h-touch rounded-lg border border-input bg-card px-3 text-base";

async function MembersContent() {
  const { user, membership } = await requireActiveMembership();
  const t = await getTranslations();
  const format = await getFormatter();
  const organizationId = membership.organization.id;

  if (membership.organization.type === "individual") {
    return (
      <section className="rounded-2xl border bg-card p-6">
        <h2 className="text-lg font-semibold">{t("members.individualTitle")}</h2>
        <p className="mt-1 text-muted-foreground">{t("members.individualBody")}</p>
      </section>
    );
  }

  const supabase = await createSupabaseServerClient();
  const manager = isManager(membership.role);

  const [members, invitations] = await Promise.all([
    supabase.rpc("list_members", { p_organization_id: organizationId }),
    manager
      ? supabase
          .from("invitations")
          .select("id, email, role, expires_at")
          .eq("organization_id", organizationId)
          .is("accepted_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : null,
  ]);

  if (members.error) throw new Error(`Could not load members: ${members.error.message}`);
  if (invitations?.error) throw new Error(`Could not load invitations: ${invitations.error.message}`);

  return (
    <>
      {manager ? (
        <section className="rounded-2xl border bg-card p-6">
          <h2 className="text-lg font-semibold">{t("members.inviteTitle")}</h2>
          <p className="mt-1 mb-5 text-muted-foreground">{t("members.inviteLead")}</p>
          <InviteForm />
        </section>
      ) : (
        <p className="text-muted-foreground">{t("members.readOnlyNote")}</p>
      )}

      <ul className="flex flex-col gap-3">
        {members.data.map((member) => {
          const isSelf = member.user_id === user.id;
          const manageable = !isSelf && canManageMember(membership.role, member.role);
          const roleOptions: readonly MemberRole[] = assignableRoles(membership.role);
          const name = [member.title, member.full_name].filter(Boolean).join(" ") || t("members.noName");

          return (
            <li key={member.membership_id} className="rounded-2xl border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                <div>
                  <p className="text-lg font-semibold">
                    {name}
                    {isSelf ? <span className="ml-2 font-normal text-muted-foreground">({t("members.you")})</span> : null}
                  </p>
                  {member.email ? <p className="text-muted-foreground">{member.email}</p> : null}
                </div>
                <p className="flex items-center gap-2">
                  <span className="rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-foreground">
                    {t(`roles.${member.role}`)}
                  </span>
                  {member.status === "suspended" ? (
                    <span className="rounded-full bg-warning-soft px-3 py-1 text-sm font-medium text-warning">
                      {t("members.statuses.suspended")}
                    </span>
                  ) : null}
                </p>
              </div>

              {manageable ? (
                <div className="mt-4 flex flex-wrap items-start gap-3 border-t pt-4">
                  <ActionForm action={updateMemberAction} className="flex flex-wrap items-center gap-3">
                    <input type="hidden" name="membershipId" value={member.membership_id} />
                    <label className="sr-only" htmlFor={`role-${member.membership_id}`}>
                      {t("members.roleLabel")}
                    </label>
                    <select
                      id={`role-${member.membership_id}`}
                      name="role"
                      defaultValue={member.role}
                      className={selectClass}
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {t(`roles.${role}`)}
                        </option>
                      ))}
                    </select>
                    {roleOptions.includes("owner") ? (
                      <label className="flex min-h-touch items-center gap-2">
                        <input
                          type="checkbox"
                          name="isClinician"
                          defaultChecked={member.is_clinician}
                          className="size-5 accent-primary"
                        />
                        {t("members.clinician")}
                      </label>
                    ) : null}
                    <SubmitButton variant="outline">{t("members.save")}</SubmitButton>
                  </ActionForm>

                  <ActionForm action={setMemberStatusAction} className="flex flex-wrap items-center gap-3">
                    <input type="hidden" name="membershipId" value={member.membership_id} />
                    <input
                      type="hidden"
                      name="status"
                      value={member.status === "active" ? "suspended" : "active"}
                    />
                    <SubmitButton variant="outline">
                      {member.status === "active" ? t("members.suspend") : t("members.reactivate")}
                    </SubmitButton>
                  </ActionForm>

                  <ActionForm
                    action={removeMemberAction}
                    confirmMessage={t("members.removeConfirm")}
                    className="flex flex-wrap items-center gap-3"
                  >
                    <input type="hidden" name="membershipId" value={member.membership_id} />
                    <SubmitButton variant="destructive">{t("members.remove")}</SubmitButton>
                  </ActionForm>
                </div>
              ) : null}

              {isSelf ? (
                <div className="mt-4 border-t pt-4">
                  <ActionForm
                    action={removeMemberAction}
                    confirmMessage={t("members.leaveConfirm")}
                    className="flex flex-wrap items-center gap-3"
                  >
                    <input type="hidden" name="membershipId" value={member.membership_id} />
                    <SubmitButton variant="outline">{t("members.leave")}</SubmitButton>
                  </ActionForm>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {invitations ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{t("members.pendingTitle")}</h2>
          {invitations.data.length === 0 ? (
            <p className="text-muted-foreground">{t("members.pendingEmpty")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {invitations.data.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border bg-card p-5"
                >
                  <div>
                    <p className="font-semibold">{invitation.email}</p>
                    <p className="text-muted-foreground">
                      {t(`roles.${invitation.role}`)} ·{" "}
                      {t("members.expires", {
                        date: format.dateTime(new Date(invitation.expires_at), { dateStyle: "long" }),
                      })}
                    </p>
                  </div>
                  <ActionForm
                    action={revokeInvitationAction}
                    confirmMessage={t("members.revokeConfirm")}
                    className="flex flex-wrap items-center gap-3"
                  >
                    <input type="hidden" name="invitationId" value={invitation.id} />
                    <SubmitButton variant="outline">{t("members.revoke")}</SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}
