import { getTranslations } from "next-intl/server";
import { MainNav, type NavItem } from "@/components/app-shell/main-nav";
import { getActiveMembership, getPermissions } from "@/lib/auth/dal";
import { countOpenConflicts } from "@/lib/conflicts/load";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
    { href: routes.clients, label: t("clients") },
    { href: routes.patients, label: t("patients") },
    { href: routes.members, label: t("members") },
    { href: routes.organization, label: t("organization") },
  ];
  if (permissions.has("billing.view")) {
    items.push({ href: routes.billing, label: t("billing") });
  }
  if (permissions.has("templates.manage_own")) {
    items.push({ href: routes.templates, label: t("templates") });
  }
  const membership = await getActiveMembership();
  if (permissions.has("clients.write") && membership) {
    const open = await countOpenConflicts(await createSupabaseServerClient(), membership.organization.id);
    // Always reachable for those who may decide, with the number when something waits.
    items.push({ href: routes.conflicts, label: open > 0 ? t("conflictsOpen", { count: open }) : t("conflicts") });
  }
  items.push({ href: routes.roles, label: t("roles") });
  if (permissions.has("audit.view")) {
    items.push({ href: routes.auditLog, label: t("auditLog") });
  }
  items.push({ href: routes.profile, label: t("profile") });

  return <MainNav label={t("label")} items={items} />;
}
