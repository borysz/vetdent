import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { MfaChallengeForm } from "@/components/auth/mfa-challenge-form";
import { RecoveryCodeForm } from "@/components/auth/recovery-code-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { signOutAction } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/dal";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("mfa");
  return { title: t("challengeTitle") };
}

/** Second step of sign-in for users with two-step verification switched on. */
export default function MfaChallengePage() {
  const t = useTranslations();

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-8 sm:px-6 sm:py-14">
      <Link href={routes.home} className="mb-8 text-2xl font-semibold tracking-tight text-primary">
        {t("app.name")}
      </Link>
      <main className="w-full max-w-md">
        <AuthCard
          title={t("mfa.challengeTitle")}
          lead={t("mfa.challengeLead")}
          footer={
            <form action={signOutAction}>
              <SubmitButton variant="ghost">{t("auth.logout")}</SubmitButton>
            </form>
          }
        >
          <Suspense fallback={<p className="text-muted-foreground">{t("common.loading")}</p>}>
            <ChallengeGate />
          </Suspense>
        </AuthCard>
      </main>
    </div>
  );
}

/** Only half-verified sessions belong here. */
async function ChallengeGate() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (!user.mfaPending) redirect(routes.app);

  return (
    <div className="flex flex-col gap-6">
      <MfaChallengeForm />
      <RecoveryCodeForm />
    </div>
  );
}
