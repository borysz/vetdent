/**
 * The summary for the animal's owner (PROJEKT_PROMPT 8.10): what was found,
 * what was done, medicines, feeding advice and the check-up date, in plain
 * language, with the coloured chart.
 *
 * `buildSummary` turns the facts of a visit into a list of blocks with every
 * text already resolved. The PDF and the print view only draw these blocks, so
 * the two can never say different things.
 *
 * NOTE: the plain-language explanations (`summary.lay.*` in the texts) need
 * sign-off by a veterinarian (see docs/SZAKMAI_ELLENORZES.md).
 */

import { badgeOf, getCode, codeOrder, type AnyCode } from "@/domain/dental/codes";
import { EMPTY_MARKS, isMissing, toothColor, type ToothColor, type ToothMarks } from "@/domain/dental/chart";
import { quadrantRows } from "@/domain/dental/layout";
import type { Species, ToothType } from "@/domain/teeth/catalog";
import { ageOf } from "@/lib/offline/visit-form";
import type { Medication } from "@/lib/offline/visit-lists";

/** Looks a text up by its full key (`dental.codes.T`), with values for its placeholders. */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

export interface SummaryInput {
  species: Species;
  organization: { name: string; address: string | null; phone: string | null; email: string | null };
  ownerName: string | null;
  patient: { name: string; breed: string | null; birthDate: string | null; neutered: boolean | null; weightKg: number | null };
  visit: {
    date: string;
    veterinarianName: string | null;
    weightKg: number | null;
    status: "draft" | "final";
    followUpDate: string | null;
    feedingAdvice: string | null;
    sutures: string | null;
    medications: readonly Medication[];
  };
  chart: ReadonlyMap<number, ToothMarks>;
  /** The photos chosen for the summary (before/after pairs and others). */
  photos: readonly SummaryPhotoInput[];
}

export interface SummaryPhotoInput {
  id: string;
  kind: "before" | "after" | "xray" | "other";
  tooth: number | null;
  quadrant: number | null;
}

export interface ChartTooth {
  number: number;
  type: ToothType;
  roots: 1 | 2 | 3;
  jaw: "maxilla" | "mandible";
  color: ToothColor;
  badges: string[];
}

export interface ChartRow {
  label: string;
  teeth: ChartTooth[];
}

export interface ListItem {
  /** The teeth it concerns, e.g. "104, 204". */
  teeth: string;
  name: string;
  /** The grade or subtype, if any. */
  detail: string | null;
  /** What it means, in plain language. */
  explanation: string;
}

export interface PhotoCaption {
  id: string;
  caption: string;
}

export type Block =
  | { type: "organization"; name: string; lines: string[] }
  | { type: "title"; text: string; subtitle: string }
  | { type: "notice"; text: string }
  | { type: "facts"; rows: { label: string; value: string }[] }
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "chart"; jaws: { label: string; rows: ChartRow[] }[]; legend: { color: ToothColor; text: string }[] }
  | { type: "list"; items: ListItem[] }
  | { type: "table"; columns: string[]; rows: string[][] }
  | { type: "highlight"; text: string }
  | { type: "photos"; pairs: { place: string; before: PhotoCaption; after: PhotoCaption }[]; singles: (PhotoCaption & { place: string })[] }
  | { type: "footer"; text: string };

export interface SummaryDocument {
  blocks: Block[];
}

/** `2026-11-16` → `2026. 11. 16.` */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[1]}. ${match[2]}. ${match[3]}.` : iso;
}

function sameText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}

interface Group {
  code: AnyCode;
  level: string;
  planned: boolean;
  teeth: number[];
}

/** The same mark on several teeth becomes one entry ("104, 204, 304"), in the order of the code catalogue. */
function collect(chart: ReadonlyMap<number, ToothMarks>, pick: (marks: ToothMarks) => { code: AnyCode; level: string; planned: boolean }[]): Group[] {
  const groups = new Map<string, Group>();
  for (const [tooth, marks] of [...chart].sort((a, b) => a[0] - b[0])) {
    for (const entry of pick(marks)) {
      const key = `${entry.code}:${entry.level}:${entry.planned}`;
      const group = groups.get(key) ?? { ...entry, teeth: [] };
      group.teeth.push(tooth);
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((a, b) => codeOrder(a.code) - codeOrder(b.code) || a.level.localeCompare(b.level));
}

function itemOf(group: Group, t: Translate): ListItem {
  const hasLevel = group.level !== "";
  return {
    teeth: group.teeth.join(", "),
    name: t(`dental.codes.${group.code}`),
    detail: hasLevel ? t(`dental.levels.${group.code}.${group.level}`) : null,
    explanation: t(`summary.lay.${group.code}`),
  };
}

export function buildSummary(input: SummaryInput, t: Translate): SummaryDocument {
  const blocks: Block[] = [];
  const unknown = t("summary.unknown");

  // -- the practice -------------------------------------------------------------
  blocks.push({
    type: "organization",
    name: input.organization.name,
    lines: [input.organization.address, input.organization.phone, input.organization.email].filter((line): line is string => Boolean(line)),
  });

  blocks.push({ type: "title", text: t("summary.title"), subtitle: formatDate(input.visit.date) });
  if (input.visit.status === "draft") blocks.push({ type: "notice", text: t("summary.draftNotice") });

  // -- who and when -------------------------------------------------------------
  const age = ageOf(input.patient.birthDate, new Date(`${input.visit.date}T12:00:00`));
  blocks.push({
    type: "facts",
    rows: [
      { label: t("summary.facts.patient"), value: input.patient.name },
      { label: t("summary.facts.owner"), value: input.ownerName ?? unknown },
      { label: t("summary.facts.species"), value: t(`patients.species.${input.species}`) },
      { label: t("summary.facts.breed"), value: sameText(input.patient.breed) ?? unknown },
      { label: t("summary.facts.age"), value: age ? t("summary.ageValue", age) : unknown },
      {
        label: t("summary.facts.neutered"),
        value: input.patient.neutered === null ? unknown : input.patient.neutered ? t("summary.yes") : t("summary.no"),
      },
      {
        label: t("summary.facts.weight"),
        value: (input.visit.weightKg ?? input.patient.weightKg) !== null ? `${input.visit.weightKg ?? input.patient.weightKg} kg` : unknown,
      },
      { label: t("summary.facts.visitDate"), value: formatDate(input.visit.date) },
      { label: t("summary.facts.veterinarian"), value: sameText(input.visit.veterinarianName) ?? unknown },
    ],
  });

  // -- the chart ----------------------------------------------------------------
  const rows = quadrantRows(input.species);
  const jaw = (arch: "upper" | "lower") => ({
    label: t(`dental.chart.${arch}`),
    rows: rows[arch].map((row) => ({
      label: t(`dental.chart.quadrants.${row.quadrant}`),
      teeth: row.teeth.map((tooth): ChartTooth => {
        const marks = input.chart.get(tooth.number) ?? EMPTY_MARKS;
        return {
          number: tooth.number,
          type: tooth.type,
          roots: tooth.roots,
          jaw: tooth.jaw,
          color: toothColor(marks),
          badges: [
            ...marks.findings.map((finding) => badgeOf(finding.code, finding.level)),
            ...marks.procedures.map((procedure) => badgeOf(procedure.code, procedure.level)),
          ],
        };
      }),
    })),
  });
  blocks.push({ type: "heading", text: t("summary.chartTitle") });
  blocks.push({
    type: "chart",
    jaws: [jaw("upper"), jaw("lower")],
    legend: (["red", "blue", "orange", "yellow", "green", "gray"] as const).map((color) => ({ color, text: t(`dental.legend.${color}`) })),
  });

  // -- what was done / is planned ------------------------------------------------
  const procedures = (planned: boolean) =>
    collect(input.chart, (marks) =>
      marks.procedures.filter((procedure) => (procedure.state === "planned") === planned).map((procedure) => ({ code: procedure.code, level: procedure.level, planned })),
    );
  const done = procedures(false);
  const planned = procedures(true);

  blocks.push({ type: "heading", text: t("summary.doneTitle") });
  if (done.length === 0 && !sameText(input.visit.sutures)) blocks.push({ type: "paragraph", text: t("summary.noneDone") });
  if (done.length > 0) blocks.push({ type: "list", items: done.map((group) => itemOf(group, t)) });
  const sutures = sameText(input.visit.sutures);
  if (sutures) blocks.push({ type: "paragraph", text: `${t("summary.suturesTitle")}: ${sutures}` });

  if (planned.length > 0) {
    blocks.push({ type: "heading", text: t("summary.plannedTitle") });
    blocks.push({ type: "list", items: planned.map((group) => itemOf(group, t)) });
  }

  // -- what was found ------------------------------------------------------------
  const findings = collect(input.chart, (marks) =>
    marks.findings.filter((finding) => finding.code !== "0").map((finding) => ({ code: finding.code, level: finding.level, planned: false })),
  );
  const healthy = [...input.chart].filter(([, marks]) => marks.findings.some((finding) => finding.code === "0")).map(([tooth]) => tooth).sort((a, b) => a - b);
  const missing = [...input.chart].filter(([, marks]) => isMissing(marks)).map(([tooth]) => tooth).sort((a, b) => a - b);

  blocks.push({ type: "heading", text: t("summary.findingsTitle") });
  const notMissing = findings.filter((group) => group.code !== "M");
  if (notMissing.length === 0 && healthy.length === 0 && missing.length === 0) blocks.push({ type: "paragraph", text: t("summary.noFindings") });
  if (notMissing.length > 0) blocks.push({ type: "list", items: notMissing.map((group) => itemOf(group, t)) });
  if (missing.length > 0) {
    blocks.push({ type: "paragraph", text: `${t("summary.missingTeeth", { teeth: missing.join(", ") })} ${t("summary.lay.M")}` });
  }
  if (healthy.length > 0) blocks.push({ type: "paragraph", text: t("summary.healthyTeeth", { teeth: healthy.join(", ") }) });

  // -- medicines, feeding, check-up ----------------------------------------------
  const medications = input.visit.medications.filter((medication) => medication.name.trim() !== "");
  if (medications.length > 0) {
    blocks.push({ type: "heading", text: t("summary.medicationsTitle") });
    blocks.push({
      type: "table",
      columns: [t("summary.columns.name"), t("summary.columns.dose"), t("summary.columns.frequency"), t("summary.columns.duration")],
      rows: medications.map((medication) => [medication.name, medication.dose || "–", medication.frequency || "–", medication.duration || "–"]),
    });
  }
  const feeding = sameText(input.visit.feedingAdvice);
  if (feeding) {
    blocks.push({ type: "heading", text: t("summary.feedingTitle") });
    blocks.push({ type: "paragraph", text: feeding });
  }
  if (input.visit.followUpDate) {
    blocks.push({ type: "highlight", text: t("summary.followUp", { date: formatDate(input.visit.followUpDate) }) });
  }

  // -- photos --------------------------------------------------------------------
  if (input.photos.length > 0) {
    const place = (photo: SummaryPhotoInput) =>
      photo.tooth !== null
        ? t("attachments.targets.tooth", { number: photo.tooth })
        : photo.quadrant !== null
          ? t("attachments.targets.quadrant", { number: photo.quadrant })
          : t("attachments.targets.visit");
    const key = (photo: SummaryPhotoInput) => `${photo.tooth ?? "-"}/${photo.quadrant ?? "-"}`;

    const befores = input.photos.filter((photo) => photo.kind === "before");
    const afters = input.photos.filter((photo) => photo.kind === "after");
    const used = new Set<string>();
    const pairs: { place: string; before: PhotoCaption; after: PhotoCaption }[] = [];
    for (const before of befores) {
      const after = afters.find((candidate) => key(candidate) === key(before) && !used.has(candidate.id));
      if (!after) continue;
      used.add(before.id);
      used.add(after.id);
      pairs.push({
        place: place(before),
        before: { id: before.id, caption: t("attachments.kinds.before") },
        after: { id: after.id, caption: t("attachments.kinds.after") },
      });
    }
    const singles = input.photos
      .filter((photo) => !used.has(photo.id))
      .map((photo) => ({ id: photo.id, place: place(photo), caption: t(`attachments.kinds.${photo.kind}`) }));

    blocks.push({ type: "heading", text: t("summary.photosTitle") });
    blocks.push({ type: "photos", pairs, singles });
  }

  blocks.push({ type: "footer", text: t("summary.footer", { organization: input.organization.name }) });
  return { blocks };
}

/** The explanation texts a code needs, for a check that every code has one. */
export function layExplanationKey(code: AnyCode): string {
  return getCode(code) ? `summary.lay.${code}` : "";
}
