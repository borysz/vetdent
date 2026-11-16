import type { Metadata } from "next";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ClientEditor } from "@/components/clients/client-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("clients");
  return { title: t("editTitle") };
}

export default function EditClientPage({ params }: PageProps<"/app/gazdik/[id]">) {
  const t = useTranslations("clients");

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">{t("editTitle")}</h1>
      {/* The id comes from the URL, which is only known at request time. */}
      <Suspense fallback={null}>
        <Editor params={params} />
      </Suspense>
    </>
  );
}

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClientEditor id={id} />;
}
