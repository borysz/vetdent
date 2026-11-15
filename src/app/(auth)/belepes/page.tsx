import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.login");
  return { title: t("title") };
}

export default function LoginPage() {
  const t = useTranslations("auth.login");

  return (
    <AuthCard
      title={t("title")}
      lead={t("lead")}
      footer={
        <>
          <Link href={routes.forgotPassword} className="font-medium text-primary underline-offset-4 hover:underline">
            {t("forgot")}
          </Link>
          <p>
            {t("noAccount")}{" "}
            <Link href={routes.signUp} className="font-medium text-primary underline-offset-4 hover:underline">
              {t("signUpLink")}
            </Link>
          </p>
        </>
      }
    >
      {/* The form reads the URL (?next=, ?hiba=), which is only known at request time. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
