import { getTranslations } from "next-intl/server";
import { MainNav, type NavItem } from "@/components/app-shell/main-nav";
import { getPermissions } from "@/lib/auth/dal";
import { routes } from "@/lib/routes";

/**
 * Builds the navigation from the user's permissions, so nobody is offered a
 * page they cannot use. (Each page checks again on its own.) Reads the
 * session, so it must be rendered inside a Suspense boundary.
 */
export async function AppNav() {
  const t = await getTranslations("nav");
  const permissions = await getPermissions();

  const items: NavItem[] = [
    { href: routes.app, label: t("dashboard"), exact: true },
    { href: routes.members, label: t("members") },
    { href: routes.organization, label: t("organization") },
  ];
  if (permissions.has("billing.view")) {
    items.push({ href: routes.billing, label: t("billing") });
  }
  items.push({ href: routes.roles, label: t("roles") });
  if (permissions.has("audit.view")) {
    items.push({ href: routes.auditLog, label: t("auditLog") });
  }
  items.push({ href: routes.profile, label: t("profile") });

  return <MainNav label={t("label")} items={items} />;
}
