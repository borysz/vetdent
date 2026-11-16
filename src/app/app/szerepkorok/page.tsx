import type { Metadata } from "next";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { requireActiveMembership } from "@/lib/auth/dal";
import { isPermissionKey } from "@/lib/auth/permissions";
import { MEMBER_ROLES } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("rolesPage");
  return { title: t("title") };
}

export default function RolesPage() {
  const t = useTranslations();

  return (
    <>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("rolesPage.title")}</h1>
        <p className="mt-1 max-w-3xl text-lg text-muted-foreground">{t("rolesPage.lead")}</p>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">{t("common.loading")}</p>}>
        <RoleMatrix />
      </Suspense>
    </>
  );
}

/** Read-only overview of which role holds which permission, straight from the database. */
async function RoleMatrix() {
  const { membership } = await requireActiveMembership();
  const t = await getTranslations();

  const supabase = await createSupabaseServerClient();
  const [permissions, grants] = await Promise.all([
    supabase.from("permissions").select("key, requires_clinician").order("sort_order"),
    supabase.from("role_permissions").select("role, permission"),
  ]);
  if (permissions.error) throw new Error(`Could not load permissions: ${permissions.error.message}`);
  if (grants.error) throw new Error(`Could not load role permissions: ${grants.error.message}`);

  const granted = new Set(grants.data.map((grant) => `${grant.role}:${grant.permission}`));

  return (
    <>
      <p>{t("rolesPage.yourRole", { role: t(`roles.${membership.role}`) })}</p>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[44rem] border-collapse text-left">
          <thead>
            <tr className="border-b">
              <th scope="col" className="p-4 font-semibold">
                {t("rolesPage.permissionColumn")}
              </th>
              {MEMBER_ROLES.map((role) => (
                <th
                  key={role}
                  scope="col"
                  className={
                    role === membership.role
                      ? "bg-accent p-4 text-center font-semibold text-accent-foreground"
                      : "p-4 text-center font-semibold"
                  }
                >
                  {t(`roles.${role}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {permissions.data.map((permission) => (
              <tr key={permission.key} className="border-b last:border-b-0">
                <th scope="row" className="p-4 font-normal">
                  {isPermissionKey(permission.key) ? t(`permissions.${permission.key}`) : permission.key}
                </th>
                {MEMBER_ROLES.map((role) => {
                  const allowed = granted.has(`${role}:${permission.key}`);
                  // Vets always have clinical authority; for owners it is optional.
                  const conditional = allowed && permission.requires_clinician && role === "owner";
                  return (
                    <td
                      key={role}
                      className={role === membership.role ? "bg-accent/50 p-4 text-center" : "p-4 text-center"}
                    >
                      {allowed ? (
                        <span className="font-medium text-success">
                          {conditional ? t("rolesPage.clinicianOnly") : t("rolesPage.allowed")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t("rolesPage.notAllowed")}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">{t("rolesPage.clinicianNote")}</p>
    </>
  );
}
