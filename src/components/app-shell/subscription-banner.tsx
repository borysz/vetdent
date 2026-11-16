import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { getEntitlements, hasPermission } from "@/lib/auth/dal";
import { subscriptionNotice } from "@/lib/billing/status";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

/**
 * Tells the user about the trial, a failed payment, a cancelled subscription
 * or read-only mode. Renders nothing when there is nothing to say. Reads the
 * session, so it must be rendered inside a Suspense boundary.
 */
export async function SubscriptionBanner() {
  const entitlements = await getEntitlements();
  if (!entitlements) return null;

  const notice = subscriptionNotice(entitlements, new Date());
  if (!notice) return null;

  const t = await getTranslations("billing.notice");
  const format = await getFormatter();
  const canOpenBilling = await hasPermission("billing.view");

  const message =
    notice.kind === "trial"
      ? t("trial", { days: notice.daysLeft })
      : notice.kind === "trial_ended"
        ? t("trialEnded")
        : notice.kind === "past_due"
          ? t("pastDue", { days: notice.daysLeft })
          : notice.kind === "canceling"
            ? t("canceling", { date: format.dateTime(new Date(notice.until), { dateStyle: "long" }) })
            : t("readOnly");

  // A running trial is information; everything else needs attention.
  const calm = notice.kind === "trial";

  return (
    <div
      role="status"
      className={cn("border-b", calm ? "bg-accent text-accent-foreground" : "border-warning bg-warning-soft text-warning")}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-2.5 sm:px-6">
        <p className="font-medium">{message}</p>
        {canOpenBilling ? (
          <Link href={routes.billing} className="inline-flex min-h-touch items-center font-medium underline underline-offset-4">
            {t("toBilling")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
