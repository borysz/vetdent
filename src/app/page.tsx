import { useTranslations } from "next-intl";
import { ConnectivityStatus } from "@/components/connectivity-status";
import { ToothCatalogPreview } from "@/components/teeth/tooth-catalog-preview";
import { SPECIES } from "@/domain/teeth/catalog";

const FEATURES = ["odontogram", "quickActions", "offline", "summary"] as const;

export default function HomePage() {
  const t = useTranslations();

  return (
    <>
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <p className="text-xl font-semibold tracking-tight text-brand-strong">{t("app.name")}</p>
          <ConnectivityStatus />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
        <section className="flex flex-col gap-4">
          <p className="w-fit rounded-full bg-brand-soft px-4 py-1.5 text-sm font-medium text-brand-strong">
            {t("home.statusBadge")}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("app.tagline")}</h1>
          <p className="max-w-3xl text-lg text-ink-muted text-pretty">{t("home.lead")}</p>
        </section>

        <section aria-labelledby="features-title" className="flex flex-col gap-4">
          <h2 id="features-title" className="text-xl font-semibold">
            {t("home.featuresTitle")}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <li key={feature} className="rounded-2xl border border-line bg-panel p-5">
                <h3 className="font-semibold">{t(`home.features.${feature}.title`)}</h3>
                <p className="mt-1 text-ink-muted">{t(`home.features.${feature}.body`)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="catalog-title" className="flex flex-col gap-4">
          <div>
            <h2 id="catalog-title" className="text-xl font-semibold">
              {t("home.catalogTitle")}
            </h2>
            <p className="mt-1 max-w-3xl text-ink-muted">{t("home.catalogLead")}</p>
          </div>
          {SPECIES.map((species) => (
            <ToothCatalogPreview key={species} species={species} />
          ))}
        </section>
      </main>
    </>
  );
}
