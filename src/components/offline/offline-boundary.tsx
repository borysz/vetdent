import { OfflineProvider } from "@/components/offline/offline-provider";
import { getEntitlements, getPermissions, requireActiveMembership } from "@/lib/auth/dal";

/**
 * Gives the signed-in area its offline layer: the user, the organization and
 * what they are allowed to do. Reads the session, so it must be rendered inside
 * a Suspense boundary.
 */
export async function OfflineBoundary({ children }: { children: React.ReactNode }) {
  const { user, membership } = await requireActiveMembership();
  const [permissions, entitlements] = await Promise.all([getPermissions(), getEntitlements()]);

  return (
    <OfflineProvider
      userId={user.id}
      organizationId={membership.organization.id}
      canWrite={permissions.has("clients.write") && entitlements?.access === "full"}
      canDelete={permissions.has("clients.delete") && entitlements?.access === "full"}
    >
      {children}
    </OfflineProvider>
  );
}
