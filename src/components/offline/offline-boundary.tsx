import { OfflineProvider } from "@/components/offline/offline-provider";
import { getEntitlements, getPermissions, getProfile, requireActiveMembership } from "@/lib/auth/dal";

/**
 * Gives the signed-in area its offline layer: the user, the organization and
 * what they are allowed to do. Reads the session, so it must be rendered inside
 * a Suspense boundary.
 */
export async function OfflineBoundary({ children }: { children: React.ReactNode }) {
  const { user, membership } = await requireActiveMembership();
  const [permissions, entitlements, profile] = await Promise.all([getPermissions(), getEntitlements(), getProfile()]);
  const fullAccess = entitlements?.access === "full";

  return (
    <OfflineProvider
      userId={user.id}
      organizationId={membership.organization.id}
      canWrite={permissions.has("clients.write") && fullAccess}
      canDelete={permissions.has("clients.delete") && fullAccess}
      visitRights={{
        write: permissions.has("visits.write") && fullAccess,
        finalize: permissions.has("visits.finalize") && fullAccess,
        reopen: permissions.has("visits.reopen") && fullAccess,
      }}
      templateRights={{
        manage: permissions.has("templates.manage_own") && fullAccess,
        share: permissions.has("catalog.manage") && fullAccess,
      }}
      features={entitlements?.features ?? []}
      userName={profile ? [profile.title, profile.fullName].filter(Boolean).join(" ") : ""}
    >
      {children}
    </OfflineProvider>
  );
}
