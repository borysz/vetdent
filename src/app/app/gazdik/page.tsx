import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ClientList } from "@/components/clients/client-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("clients");
  return { title: t("title") };
}

export default function ClientsPage() {
  const t = useTranslations("clients");

  return (
    <>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 max-w-3xl text-lg text-muted-foreground">{t("lead")}</p>
      </div>
      <ClientList />
    </>
  );
}
