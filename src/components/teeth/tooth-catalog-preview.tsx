import { useTranslations } from "next-intl";
import { getOdontogramRows, getTeeth, type Species, type ToothDefinition } from "@/domain/teeth/catalog";

/**
 * Read-only preview of the tooth catalogue in screen order. This is a
 * foundation check, not the odontogram: the interactive, illustrated chart
 * replaces it later.
 */
export function ToothCatalogPreview({ species }: { species: Species }) {
  const t = useTranslations();
  const rows = getOdontogramRows(species);

  return (
    <section
      aria-labelledby={`catalog-${species}`}
      className="rounded-2xl border border-line bg-panel p-4 sm:p-6"
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={`catalog-${species}`} className="text-lg font-semibold">
          {t(`species.${species}`)}
        </h3>
        <p className="text-sm text-ink-muted">{t("teeth.count", { count: getTeeth(species).length })}</p>
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="inline-flex min-w-full flex-col gap-4">
          <JawRow label={t("teeth.upperJaw")} teeth={rows.upper} />
          <JawRow label={t("teeth.lowerJaw")} teeth={rows.lower} />
        </div>
      </div>
    </section>
  );
}

function JawRow({ label, teeth }: { label: string; teeth: readonly ToothDefinition[] }) {
  const t = useTranslations("teeth");
  const right = teeth.filter((tooth) => tooth.side === "right");
  const left = teeth.filter((tooth) => tooth.side === "left");

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink-muted">{label}</p>
      <div className="flex items-stretch justify-center gap-3">
        <SideLabel>{t("patientRight")}</SideLabel>
        <ToothGroup teeth={right} />
        <span aria-hidden="true" className="w-px self-stretch bg-line" />
        <ToothGroup teeth={left} />
        <SideLabel>{t("patientLeft")}</SideLabel>
      </div>
    </div>
  );
}

function SideLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex shrink-0 items-center text-xs font-semibold tracking-wide text-ink-muted uppercase">
      {children}
    </span>
  );
}

function ToothGroup({ teeth }: { teeth: readonly ToothDefinition[] }) {
  const t = useTranslations("teeth");

  return (
    <ul className="flex gap-1">
      {teeth.map((tooth) => (
        <li
          key={tooth.number}
          aria-label={t("toothLabel", { number: tooth.number, type: t(`types.${tooth.type}`) })}
          className="flex size-touch shrink-0 items-center justify-center rounded-lg border-2 border-tooth-healthy bg-panel font-mono text-sm font-medium"
        >
          {tooth.number}
        </li>
      ))}
    </ul>
  );
}
