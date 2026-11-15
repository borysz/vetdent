import Link from "next/link";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { AccountMenu } from "@/components/app-shell/account-menu";
import { ConnectivityStatus } from "@/components/connectivity-status";
import { routes } from "@/lib/routes";

/**
 * Frame of the signed-in area. The frame itself is static; everything that
 * depends on the session streams in behind its own Suspense boundary.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations();

  return (
    <>
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-4">
            <Link href={routes.app} className="text-xl font-semibold tracking-tight text-primary">
              {t("app.name")}
            </Link>
            <ConnectivityStatus />
          </div>
          <Suspense fallback={<p className="text-sm text-muted-foreground">{t("common.loading")}</p>}>
            <AccountMenu />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}
