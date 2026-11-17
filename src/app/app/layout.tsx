import Link from "next/link";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { AccountMenu } from "@/components/app-shell/account-menu";
import { AppNav } from "@/components/app-shell/app-nav";
import { SubscriptionBanner } from "@/components/app-shell/subscription-banner";
import { ConnectivityStatus } from "@/components/connectivity-status";
import { OfflineBoundary } from "@/components/offline/offline-boundary";
import { routes } from "@/lib/routes";

/**
 * Frame of the signed-in area. The offline layer wraps all of it, so the
 * header can show the synchronisation state; it needs the user and the
 * organization, which are request-time data, hence the Suspense boundary.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations();

  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">{t("common.loading")}</p>}>
      <OfflineBoundary>
        <header className="border-b bg-card print:hidden">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-4">
              <Link href={routes.app} className="inline-flex min-h-touch items-center text-xl font-semibold tracking-tight text-primary">
                {t("app.name")}
              </Link>
              <ConnectivityStatus />
            </div>
            <AccountMenu />
          </div>
        </header>
        <div className="print:hidden">
          <AppNav />
          <SubscriptionBanner />
        </div>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 print:max-w-none print:p-0">{children}</main>
      </OfflineBoundary>
    </Suspense>
  );
}
