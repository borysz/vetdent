import type { Metadata } from "next";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { TemplatesManager } from "@/components/templates/templates-manager";
import { requireActiveMembership } from "@/lib/auth/dal";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("templates");
  return { title: t("title") };
}

export default function TemplatesPage() {
  const t = useTranslations("templates");

  return (
    <>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-lg text-muted-foreground">{t("lead")}</p>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">{t("loading")}</p>}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  // Also the access check for this page: no session or no organization → redirect.
  await requireActiveMembership();
  return <TemplatesManager />;
}
