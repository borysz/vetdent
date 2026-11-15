import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SubmitButton } from "@/components/forms/submit-button";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOutAction } from "@/lib/auth/actions";
import { getMemberships, getProfile, requireUser } from "@/lib/auth/dal";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("title") };
}

export default function OnboardingPage() {
  const t = useTranslations();

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-8 sm:px-6 sm:py-14">
      <div className="mb-8 flex w-full max-w-2xl items-center justify-between gap-4">
        <Link href={routes.home} className="text-2xl font-semibold tracking-tight text-primary">
          {t("app.name")}
        </Link>
        <form action={signOutAction}>
          <SubmitButton variant="outline">{t("auth.logout")}</SubmitButton>
        </form>
      </div>
      <main className="w-full max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 className="text-2xl font-semibold tracking-tight">{t("onboarding.title")}</h1>
            </CardTitle>
            <CardDescription className="text-base">{t("onboarding.lead")}</CardDescription>
          </CardHeader>
          <CardContent>
            {/* Reads the session, so it streams in behind the boundary. */}
            <Suspense fallback={<p className="text-muted-foreground">{t("common.loading")}</p>}>
              <OnboardingGate />
            </Suspense>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

/** Only users without an organization see the form; everyone else goes to the app. */
async function OnboardingGate() {
  await requireUser();

  const memberships = await getMemberships();
  if (memberships.length > 0) redirect(routes.app);

  const profile = await getProfile();
  return <OnboardingForm defaultName={profile?.fullName ?? ""} />;
}
