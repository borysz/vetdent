"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useSource } from "@/components/attachments/attachments-panel";
import { ToothShape } from "@/components/dental/tooth-shape";
import { useRequiredOffline } from "@/components/offline/offline-provider";
import { Button } from "@/components/ui/button";
import type { ToothColor, ToothMarks } from "@/domain/dental/chart";
import { buildSummary, type Block, type SummaryInput, type Translate } from "@/domain/summary/summary";
import { clientOps } from "@/lib/offline/clients-model";
import { listAttachmentsOfVisit, type AttachmentListItem } from "@/lib/offline/attachments-store";
import { getPatient } from "@/lib/offline/patients-store";
import { loadChart } from "@/lib/offline/teeth-store";
import { parseMedications } from "@/lib/offline/visit-lists";
import { getVisit } from "@/lib/offline/visits-store";
import { summaryPdfPath, visitPath } from "@/lib/routes";
import type { OrganizationContact } from "@/lib/summary/organization";

/** Photos the summary can offer: pictures only. */
const isPicture = (item: AttachmentListItem) => (item.type ?? "").startsWith("image/");
/** Photos the PDF can draw: the file is in the bucket and is a JPEG or PNG. */
const inPdf = (item: AttachmentListItem) => item.uploaded && (item.type === "image/jpeg" || item.type === "image/png");
const BEFORE_AFTER = new Set(["before", "after"]);

/**
 * The summary for the animal's owner on screen and on paper, built from the
 * data on this device, so it works without a connection. Printing it (or
 * saving it as PDF from the print dialog) gives the same content as the PDF
 * file the server makes.
 */
export function SummaryView({ visitId, organization }: { visitId: string; organization: OrganizationContact }) {
  const t = useTranslations("summaryPage");
  const { db, summaryRights, status } = useRequiredOffline();

  const data = useLiveQuery(async () => {
    if (!db) return undefined;
    const visit = await getVisit(db, visitId);
    if (!visit) return null;
    const patient = await getPatient(db, visit.patientId);
    const owner = patient ? await db.clients.get(patient.clientId) : undefined;
    const chart = await loadChart(db, visitId);
    const attachments = (await listAttachmentsOfVisit(db, visitId)).filter(isPicture);
    return { visit, patient, ownerName: owner ? clientOps.viewOf(owner).fullName : null, chart, attachments };
  }, [db, visitId]);

  // `null`: the user has not chosen yet, so the before/after photos are taken.
  const [chosen, setChosen] = useState<ReadonlySet<string> | null>(null);

  if (data === undefined) return <p className="text-muted-foreground">{t("loading")}</p>;
  if (data === null || !data.patient) return <p className="text-lg">{t("notFound")}</p>;

  const { visit, patient } = data;
  if (!(summaryRights.any || (summaryRights.finalized && visit.status === "final"))) {
    return <p className="text-lg">{t("notAllowed")}</p>;
  }

  const selected = chosen ?? new Set(data.attachments.filter((item) => BEFORE_AFTER.has(item.kind)).map((item) => item.id));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosen(next);
  };

  const photos = data.attachments.filter((item) => selected.has(item.id));
  const input: SummaryInput = {
    species: patient.species,
    organization,
    ownerName: data.ownerName,
    patient: { name: patient.name, breed: patient.breed, birthDate: patient.birthDate, neutered: patient.neutered, weightKg: patient.weightKg },
    visit: {
      date: visit.visitDate,
      veterinarianName: visit.veterinarianName,
      weightKg: visit.weightKg,
      status: visit.status,
      followUpDate: visit.followUpDate,
      feedingAdvice: visit.feedingAdvice,
      sutures: visit.sutures,
      medications: parseMedications(visit.medications),
    },
    chart: new Map<number, ToothMarks>([...data.chart].map(([tooth, entry]) => [tooth, entry.marks])),
    photos: photos.map((item) => ({ id: item.id, kind: item.kind, tooth: item.tooth, quadrant: item.quadrant })),
  };

  const pdfPhotoIds = photos.filter(inPdf).map((item) => item.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 print:hidden">
        <p className="max-w-3xl text-muted-foreground">{t("lead")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => window.print()}>
            {t("print")}
          </Button>
          {status.online ? (
            <a
              href={summaryPdfPath(visitId, pdfPhotoIds)}
              target="_blank"
              rel="noopener"
              className="inline-flex min-h-touch items-center justify-center rounded-lg border border-input bg-card px-4 font-medium hover:bg-accent"
            >
              {t("download")}
            </a>
          ) : (
            <p className="text-sm text-muted-foreground">{t("downloadOffline")}</p>
          )}
          <Link
            href={visitPath(visitId)}
            className="inline-flex min-h-touch items-center px-2 font-medium text-primary underline-offset-4 hover:underline"
          >
            {t("back")}
          </Link>
        </div>
        <PhotoChooser items={data.attachments} selected={selected} onToggle={toggle} />
      </div>

      <SummaryPaper input={input} attachments={data.attachments} />
    </div>
  );
}

function PhotoChooser({
  items,
  selected,
  onToggle,
}: {
  items: readonly AttachmentListItem[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("summaryPage");
  const tKinds = useTranslations("attachments.kinds");

  return (
    <fieldset className="flex max-w-3xl flex-col gap-3 rounded-xl border bg-card p-4">
      <legend className="px-1 font-medium">{t("photosTitle")}</legend>
      {items.length === 0 ? <p className="text-muted-foreground">{t("noPhotos")}</p> : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex min-h-touch cursor-pointer flex-col gap-1">
              <Thumb item={item} />
              <span className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="size-5" checked={selected.has(item.id)} onChange={() => onToggle(item.id)} />
                {tKinds(item.kind)}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function Thumb({ item }: { item: AttachmentListItem }) {
  const source = useSource(item, false);
  return (
    <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border bg-muted">
      {source ? (
        // eslint-disable-next-line @next/next/no-img-element -- a picture from this device or a short-lived signed link, not a site asset
        <img src={source} alt="" className="size-full object-cover" />
      ) : null}
    </span>
  );
}

/** The paper itself: white, A4-proportioned, the same blocks the PDF draws. */
function SummaryPaper({ input, attachments }: { input: SummaryInput; attachments: readonly AttachmentListItem[] }) {
  const t = useTranslations();
  const translate = useMemo<Translate>(() => (key, values) => t(key as never, values as never), [t]);
  const document = useMemo(() => buildSummary(input, translate), [input, translate]);
  const byId = new Map(attachments.map((item) => [item.id, item]));

  return (
    <article className="mx-auto flex w-full max-w-[210mm] flex-col gap-3 rounded-xl border bg-white p-5 text-[15px] leading-relaxed text-foreground sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0 print:text-[10.5pt]">
      {document.blocks.map((block, index) => (
        <BlockView key={index} block={block} photos={byId} />
      ))}
    </article>
  );
}

function BlockView({ block, photos }: { block: Block; photos: ReadonlyMap<string, AttachmentListItem> }) {
  switch (block.type) {
    case "organization":
      return (
        <header className="border-b pb-3">
          <p className="text-lg font-semibold text-primary">{block.name}</p>
          {block.lines.map((line) => (
            <p key={line} className="text-sm text-muted-foreground">
              {line}
            </p>
          ))}
        </header>
      );
    case "title":
      return (
        <div className="pt-2">
          <h2 className="text-3xl font-bold">{block.text}</h2>
          <p className="text-muted-foreground">{block.subtitle}</p>
        </div>
      );
    case "notice":
      return <p className="rounded-lg border border-tooth-tartar bg-[#fff4d6] p-3 text-sm print:break-inside-avoid">{block.text}</p>;
    case "facts":
      return (
        <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-1 print:break-inside-avoid">
          {block.rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="font-semibold">{row.value}</dd>
            </div>
          ))}
        </dl>
      );
    case "heading":
      return <h3 className="mt-3 text-xl font-semibold text-primary print:break-after-avoid">{block.text}</h3>;
    case "paragraph":
      return <p>{block.text}</p>;
    case "chart":
      return <ChartView block={block} />;
    case "list":
      return (
        <ul className="flex flex-col gap-2">
          {block.items.map((item, index) => (
            <li key={index} className="print:break-inside-avoid">
              <p className="font-semibold">
                {item.detail ? `${item.name} (${item.detail})` : item.name} – {item.teeth}
              </p>
              <p className="text-sm text-muted-foreground">{item.explanation}</p>
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <table className="w-full border-collapse text-left print:break-inside-avoid">
          <thead>
            <tr className="border-b text-sm text-muted-foreground">
              {block.columns.map((column) => (
                <th key={column} scope="col" className="py-1 pr-2 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, index) => (
              <tr key={index} className="border-b">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="py-1 pr-2">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "highlight":
      return <p className="rounded-xl bg-accent p-4 text-lg font-semibold text-primary print:break-inside-avoid">{block.text}</p>;
    case "photos":
      return (
        <div className="flex flex-col gap-4">
          {block.pairs.map((pair, index) => (
            <figure key={index} className="flex flex-col gap-1 print:break-inside-avoid">
              <figcaption className="text-sm font-semibold text-muted-foreground">{pair.place}</figcaption>
              <div className="grid grid-cols-2 gap-3">
                <Photo item={photos.get(pair.before.id)} caption={pair.before.caption} />
                <Photo item={photos.get(pair.after.id)} caption={pair.after.caption} />
              </div>
            </figure>
          ))}
          {block.singles.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {block.singles.map((single) => (
                <Photo key={single.id} item={photos.get(single.id)} caption={`${single.place} – ${single.caption}`} />
              ))}
            </div>
          ) : null}
        </div>
      );
    case "footer":
      return <p className="mt-4 text-xs text-muted-foreground">{block.text}</p>;
  }
}

function Photo({ item, caption }: { item: AttachmentListItem | undefined; caption: string }) {
  if (!item) return null;
  return (
    <div className="flex flex-col items-center gap-1 print:break-inside-avoid">
      <PhotoImage item={item} />
      <p className="text-center text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}

function PhotoImage({ item }: { item: AttachmentListItem }) {
  const source = useSource(item, true);
  if (!source) return <div className="h-40 w-full rounded-lg bg-muted" />;
  // eslint-disable-next-line @next/next/no-img-element -- a picture from this device or a short-lived signed link, not a site asset
  return <img src={source} alt="" className="max-h-64 w-auto max-w-full object-contain" />;
}

/** The legend chips, spelled out in full so the stylesheet generator finds the classes. */
const LEGEND_CHIP: Readonly<Record<ToothColor, string>> = {
  red: "bg-tooth-extract",
  blue: "bg-tooth-endo",
  orange: "bg-tooth-inflamed",
  yellow: "bg-tooth-tartar",
  green: "bg-tooth-healthy",
  gray: "border border-dashed border-tooth-missing",
  none: "border",
};

/** The coloured dental chart: four quadrant rows with a short colour legend. */
function ChartView({ block }: { block: Extract<Block, { type: "chart" }> }) {
  return (
    <div className="flex flex-col gap-3">
      {block.jaws.map((jaw) => (
        <div key={jaw.label} className="flex flex-col gap-1 print:break-inside-avoid">
          <p className="text-sm font-semibold text-muted-foreground">{jaw.label}</p>
          {jaw.rows.map((row) => (
            <div key={row.label} className="flex items-center gap-2">
              <p className="w-16 shrink-0 text-xs text-muted-foreground">{row.label}</p>
              <ol className="grid flex-1 gap-0.5" style={{ gridTemplateColumns: `repeat(${row.teeth.length}, minmax(0, 1fr))` }}>
                {row.teeth.map((tooth) => (
                  <li key={tooth.number} className="flex min-w-0 flex-col items-center">
                    <ToothShape type={tooth.type} roots={tooth.roots} jaw={tooth.jaw} color={tooth.color} className="aspect-[2/3] w-full max-w-11" />
                    <span className="text-[10px] font-bold leading-none">{tooth.number}</span>
                    <span className="h-3 text-[8px] leading-3 text-muted-foreground">{tooth.badges.join(" ")}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ))}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {block.legend.map((entry) => (
          <li key={entry.color} className="flex items-center gap-1.5">
            <span className={`inline-block size-3 rounded-sm ${LEGEND_CHIP[entry.color]}`} />
            {entry.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
