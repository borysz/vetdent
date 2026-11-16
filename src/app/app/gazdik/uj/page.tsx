import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ClientEditor } from "@/components/clients/client-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("clients");
  return { title: t("newTitle") };
}

export default function NewClientPage() {
  const t = useTranslations("clients");

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">{t("newTitle")}</h1>
      <ClientEditor />
    </>
  );
}
