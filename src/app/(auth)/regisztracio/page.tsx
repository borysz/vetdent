import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { routes } from "@/lib/routes";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signUp");
  return { title: t("title") };
}

export default function SignUpPage() {
  const t = useTranslations("auth.signUp");

  return (
    <AuthCard
      title={t("title")}
      lead={t("lead")}
      footer={
        <p>
          {t("hasAccount")}{" "}
          <Link href={routes.login} className="font-medium text-primary underline-offset-4 hover:underline">
            {t("loginLink")}
          </Link>
        </p>
      }
    >
      {/* The form reads the URL (?next=), which is only known at request time. */}
      <Suspense fallback={null}>
        <SignUpForm />
      </Suspense>
    </AuthCard>
  );
}
