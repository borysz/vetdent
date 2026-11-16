import { getTranslations } from "next-intl/server";
import { SubmitButton } from "@/components/forms/submit-button";
import { SignOutForm } from "@/components/app-shell/sign-out-form";
import { getMemberships, requireActiveMembership } from "@/lib/auth/dal";
import { switchOrganizationAction } from "@/lib/organizations/actions";

/**
 * Shows which organization the user is working in, lets them switch if they
 * belong to more than one, and sign out. Reads the session, so it must be
 * rendered inside a Suspense boundary.
 */
export async function AccountMenu() {
  const { membership } = await requireActiveMembership();
  const memberships = await getMemberships();
  const t = await getTranslations();

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
      <div className="text-right leading-tight">
        <p className="font-semibold">{membership.organization.name}</p>
        <p className="text-sm text-muted-foreground">
          {t("appShell.roleInOrganization", {
            role: t(`roles.${membership.role}`),
            type: t(`organizationTypes.${membership.organization.type}`),
          })}
        </p>
      </div>

      {memberships.length > 1 ? (
        <form action={switchOrganizationAction} className="flex items-center gap-2">
          <label htmlFor="organization-switcher" className="sr-only">
            {t("appShell.switchLabel")}
          </label>
          <select
            id="organization-switcher"
            name="organizationId"
            defaultValue={membership.organization.id}
            className="h-touch max-w-56 rounded-lg border border-input bg-card px-3 text-base"
          >
            {memberships.map((item) => (
              <option key={item.organization.id} value={item.organization.id}>
                {item.organization.name}
              </option>
            ))}
          </select>
          <SubmitButton variant="outline">{t("appShell.switchSubmit")}</SubmitButton>
        </form>
      ) : null}

      <SignOutForm label={t("auth.logout")} />
    </div>
  );
}
