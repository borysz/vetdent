import type { Metadata } from "next";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { getEntitlements, requirePermission } from "@/lib/auth/dal";
import { isPlanFeature, seatUsage } from "@/lib/billing/status";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("billing");
  return { title: t("title") };
}

export default function BillingPage() {
  const t = useTranslations();

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">{t("billing.title")}</h1>
      <Suspense fallback={<p className="text-muted-foreground">{t("common.loading")}</p>}>
        <BillingContent />
      </Suspense>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-6">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

async function BillingContent() {
  await requirePermission("billing.view");
  const entitlements = await getEntitlements();
  const t = await getTranslations("billing");
  const format = await getFormatter();

  if (!entitlements) return null;

  const date = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "long" });
  const seats = seatUsage(entitlements);
  const readOnly = entitlements.access === "read_only";
  const features = entitlements.features.filter(isPlanFeature);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Section title={t("planTitle")}>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-2xl font-semibold">{entitlements.planName}</p>
          <span
            className={
              readOnly || entitlements.status === "past_due"
                ? "rounded-full bg-warning-soft px-3 py-1 text-sm font-medium text-warning"
                : "rounded-full bg-accent px-3 py-1 text-sm font-medium text-accent-foreground"
            }
          >
            {readOnly ? t("readOnlyStatus") : t(`statuses.${entitlements.status}`)}
          </span>
        </div>
        <div className="mt-3 flex flex-col gap-1 text-muted-foreground">
          {entitlements.status === "trialing" && entitlements.trialEndsAt ? (
            <p>{t("trialEnds", { date: date(entitlements.trialEndsAt) })}</p>
          ) : null}
          {entitlements.status !== "trialing" && entitlements.currentPeriodEnd ? (
            <p>{t("periodEnds", { date: date(entitlements.currentPeriodEnd) })}</p>
          ) : null}
          {entitlements.status === "past_due" && entitlements.graceEndsAt ? (
            <p>{t("graceEnds", { date: date(entitlements.graceEndsAt) })}</p>
          ) : null}
        </div>
      </Section>

      <Section title={t("usageTitle")}>
        <dl className="flex flex-col gap-5">
          <div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="font-medium">{t("seats")}</dt>
              <dd>
                {seats.max === null
                  ? t("seatsUnlimited", { used: seats.used })
                  : t("seatsValue", { used: seats.used, max: seats.max })}
              </dd>
            </div>
            {seats.max !== null ? (
              <div
                role="meter"
                aria-label={t("seats")}
                aria-valuemin={0}
                aria-valuemax={seats.max}
                aria-valuenow={Math.min(seats.used, seats.max)}
                className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className={seats.free === 0 ? "h-full bg-warning" : "h-full bg-primary"}
                  style={{ width: `${Math.min(100, Math.round((seats.used / seats.max) * 100))}%` }}
                />
              </div>
            ) : null}
            {entitlements.pendingInvitationCount > 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {t("seatsPending", { count: entitlements.pendingInvitationCount })}
              </p>
            ) : null}
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="font-medium">{t("storage")}</dt>
            <dd>{t("storageValue", { gb: entitlements.storageGb })}</dd>
          </div>
        </dl>
      </Section>

      {features.length > 0 ? (
        <Section title={t("featuresTitle")}>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {features.map((feature) => (
              <li key={feature}>{t(`features.${feature}`)}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title={t("paymentTitle")}>
        <p className="text-muted-foreground">{t("paymentPending")}</p>
      </Section>
    </div>
  );
}
