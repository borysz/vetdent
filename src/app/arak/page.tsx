import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { isPlanFeature } from "@/lib/billing/status";
import { routes } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pricing");
  return { title: t("title") };
}

export default function PricingPage() {
  const t = useTranslations();

  return (
    <>
      <header className="border-b bg-card">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href={routes.home} className="text-xl font-semibold tracking-tight text-primary">
            {t("app.name")}
          </Link>
          <nav className="flex items-center gap-2">
            <Link href={routes.login} className={buttonVariants({ variant: "outline" })}>
              {t("home.login")}
            </Link>
            <Link href={routes.signUp} className={buttonVariants()}>
              {t("home.signUp")}
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("pricing.title")}</h1>
        {/* Plans and prices come from the database at request time. */}
        <Suspense fallback={<p className="text-muted-foreground">{t("common.loading")}</p>}>
          <Plans />
        </Suspense>
      </main>
    </>
  );
}

async function Plans() {
  await connection();
  const t = await getTranslations();
  const format = await getFormatter();

  const supabase = await createSupabaseServerClient();
  const { data: plans, error } = await supabase.rpc("list_public_plans");

  if (error || plans.length === 0) {
    return <p className="text-muted-foreground">{t("pricing.empty")}</p>;
  }

  const { trial_days: trialDays, vat_percent: vatPercent, prices_include_vat: pricesIncludeVat } = plans[0];
  const money = (amount: number) =>
    format.number(amount, { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
  const anyPrice = plans.some((plan) => plan.monthly_price_huf !== null || plan.yearly_price_huf !== null);

  return (
    <>
      <p className="max-w-3xl text-lg text-muted-foreground">{t("pricing.lead", { days: trialDays })}</p>

      <ul className="grid gap-6 md:grid-cols-2">
        {plans.map((plan) => (
          <li key={plan.key} className="flex flex-col gap-4 rounded-2xl border bg-card p-6">
            <div>
              <p className="text-sm font-medium text-accent-foreground">{t(`pricing.audience.${plan.audience}`)}</p>
              <h2 className="text-2xl font-semibold">{plan.name}</h2>
              {plan.description ? <p className="mt-1 text-muted-foreground">{plan.description}</p> : null}
            </div>

            {plan.monthly_price_huf !== null || plan.yearly_price_huf !== null ? (
              <div className="flex flex-col gap-0.5">
                {plan.monthly_price_huf !== null ? (
                  <p className="text-2xl font-semibold">
                    {t("pricing.perMonth", { price: money(plan.monthly_price_huf) })}
                  </p>
                ) : null}
                {plan.yearly_price_huf !== null ? (
                  <p className="text-muted-foreground">{t("pricing.perYear", { price: money(plan.yearly_price_huf) })}</p>
                ) : null}
              </div>
            ) : null}

            <ul className="flex list-disc flex-col gap-1 pl-5">
              <li>
                {plan.max_members === null
                  ? t("pricing.usersUnlimited")
                  : t("pricing.users", { count: plan.max_members })}
              </li>
              <li>{t("pricing.storage", { gb: plan.storage_gb })}</li>
              {plan.features.filter(isPlanFeature).map((feature) => (
                <li key={feature}>{t(`billing.features.${feature}`)}</li>
              ))}
            </ul>

            <Link href={routes.signUp} className={buttonVariants({ size: "lg", className: "mt-auto" })}>
              {t("pricing.start")}
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-sm text-muted-foreground">
        {anyPrice
          ? t(pricesIncludeVat ? "pricing.vatGross" : "pricing.vatNet", { vat: vatPercent })
          : t("pricing.priceSoon")}
      </p>
    </>
  );
}
