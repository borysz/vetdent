import type { Metadata } from "next";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { DashboardOverview } from "@/components/app-shell/dashboard-overview";
import { getProfile, requireActiveMembership } from "@/lib/auth/dal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default function DashboardPage() {
  const t = useTranslations();

  return (
    <>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
        <Suspense fallback={<p className="mt-1 text-lg text-muted-foreground">{t("common.loading")}</p>}>
          <Welcome />
        </Suspense>
      </div>

      <DashboardOverview />
      <p className="text-sm text-muted-foreground">{t("dashboard.visitsSoon")}</p>
    </>
  );
}

async function Welcome() {
  // Also the access check for this page: no session or no organization → redirect.
  await requireActiveMembership();
  const profile = await getProfile();
  const t = await getTranslations("dashboard");

  return (
    <p className="mt-1 text-lg text-muted-foreground">
      {profile?.fullName ? t("welcome", { name: profile.fullName }) : t("welcomeNoName")}
    </p>
  );
}
