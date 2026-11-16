import type { Metadata } from "next";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { OrganizationForm } from "@/components/organization/organization-form";
import { requireActiveMembership } from "@/lib/auth/dal";
import { isManager } from "@/lib/auth/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("organization");
  return { title: t("title") };
}

export default function OrganizationPage() {
  const t = useTranslations();

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">{t("organization.title")}</h1>
      <Suspense fallback={<p className="text-muted-foreground">{t("common.loading")}</p>}>
        <OrganizationContent />
      </Suspense>
    </>
  );
}

async function OrganizationContent() {
  const { membership } = await requireActiveMembership();
  const t = await getTranslations();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("type, name, tax_number, postal_code, city, address_line, phone")
    .eq("id", membership.organization.id)
    .single();

  if (error) throw new Error(`Could not load organization: ${error.message}`);

  return (
    <section className="max-w-3xl rounded-2xl border bg-card p-6">
      <p className="mb-5 text-muted-foreground">
        {t("organization.typeLabel")}:{" "}
        <span className="text-foreground">{t(`organizationTypes.${data.type}`)}</span>
      </p>
      <OrganizationForm
        editable={isManager(membership.role)}
        details={{
          type: data.type,
          name: data.name,
          taxNumber: data.tax_number ?? "",
          postalCode: data.postal_code ?? "",
          city: data.city ?? "",
          addressLine: data.address_line ?? "",
          phone: data.phone ?? "",
        }}
      />
    </section>
  );
}
