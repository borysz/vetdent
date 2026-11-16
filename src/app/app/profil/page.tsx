import type { Metadata } from "next";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { ChangePasswordForm, MfaSettings, ProfileDetailsForm } from "@/components/profile/profile-forms";
import { getProfile, requireUser } from "@/lib/auth/dal";
import { signOutOtherSessionsAction } from "@/lib/profile/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("profile");
  return { title: t("title") };
}

export default function ProfilePage() {
  const t = useTranslations();

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">{t("profile.title")}</h1>
      <Suspense fallback={<p className="text-muted-foreground">{t("common.loading")}</p>}>
        <ProfileContent />
      </Suspense>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-6">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

async function ProfileContent() {
  const user = await requireUser();
  const profile = await getProfile();
  const t = await getTranslations();

  const supabase = await createSupabaseServerClient();
  const factors = await supabase.auth.mfa.listFactors();
  const mfaEnabled = (factors.data?.totp.length ?? 0) > 0;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Section title={t("profile.detailsTitle")}>
        <p className="mb-5 text-muted-foreground">
          {t("profile.emailLabel")}: <span className="text-foreground">{user.email}</span>
        </p>
        <ProfileDetailsForm fullName={profile?.fullName ?? ""} title={profile?.title ?? ""} />
      </Section>

      <Section title={t("profile.passwordTitle")}>
        <ChangePasswordForm />
      </Section>

      <Section title={t("mfa.title")}>
        <MfaSettings enabled={mfaEnabled} />
      </Section>

      <Section title={t("profile.sessionsTitle")}>
        <p className="mb-4">{t("profile.sessionsBody")}</p>
        <ActionForm action={signOutOtherSessionsAction} className="flex flex-wrap items-center gap-3">
          <SubmitButton variant="outline">{t("profile.signOutOthers")}</SubmitButton>
        </ActionForm>
      </Section>
    </div>
  );
}
