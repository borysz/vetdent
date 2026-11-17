import type { Metadata } from "next";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SummaryView } from "@/components/summary/summary-view";
import { requireActiveMembership } from "@/lib/auth/dal";
import { loadOrganizationContact } from "@/lib/summary/load";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("summaryPage");
  return { title: t("title") };
}

export default function SummaryPage({ params }: PageProps<"/app/vizitek/[id]/osszefoglalo">) {
  const t = useTranslations("summaryPage");

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight print:hidden">{t("title")}</h1>
      {/* The id comes from the URL, which is only known at request time. */}
      <Suspense fallback={null}>
        <Summary params={params} />
      </Suspense>
    </>
  );
}

async function Summary({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { membership } = await requireActiveMembership();
  // The practice's address is not kept on the device; the page carries it (and the offline copy of the page keeps it).
  const contact = (await loadOrganizationContact(await createSupabaseServerClient(), membership.organization.id)) ?? {
    name: membership.organization.name,
    address: null,
    phone: null,
    email: null,
  };
  return <SummaryView visitId={id} organization={contact} />;
}
