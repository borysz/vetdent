import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { NewPasswordForm } from "@/components/auth/new-password-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.newPassword");
  return { title: t("title") };
}

/** Reached from the password reset e-mail; the proxy only lets signed-in users in. */
export default function NewPasswordPage() {
  const t = useTranslations("auth.newPassword");

  return (
    <AuthCard title={t("title")} lead={t("lead")}>
      <NewPasswordForm />
    </AuthCard>
  );
}
