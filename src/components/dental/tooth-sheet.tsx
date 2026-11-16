"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { FINDING_CODES, PROCEDURE_CODES, getCode, type FindingCode, type ProcedureCode } from "@/domain/dental/codes";
import {
  DEFAULT_POCKET_THRESHOLD_MM,
  EMPTY_MARKS,
  MAX_POCKET_MM,
  POCKET_POINTS,
  canApply,
  deepestPocket,
  suggestedPdLevel,
  withFinding,
  withProcedure,
  withProcedureState,
  withoutCode,
  type PocketDepths,
  type ProcedureState,
} from "@/domain/dental/chart";
import type { Species, ToothDefinition } from "@/domain/teeth/catalog";
import { Button } from "@/components/ui/button";
import { levelKey } from "@/components/dental/keys";
import type { ToothChart, ToothParts } from "@/lib/offline/teeth-store";

const chipClass = "min-h-touch min-w-touch rounded-lg border px-3 text-base disabled:opacity-40";
const chipOn = "border-primary bg-accent font-semibold";

interface ToothSheetProps {
  tooth: ToothDefinition;
  species: Species;
  entry: ToothChart | undefined;
  /** Final visit, or no right to edit: everything is shown, nothing can be changed. */
  locked: boolean;
  onChange: (parts: ToothParts) => void;
  onClose: () => void;
  /** Anything else that belongs to this tooth (its attachments), shown above the note. */
  extras?: React.ReactNode;
}

/** The detail sheet of one tooth: findings, procedures, pocket depths and a note. */
export function ToothSheet({ tooth, species, entry, locked, onChange, onClose, extras }: ToothSheetProps) {
  const t = useTranslations("dental");
  const dialog = useRef<HTMLDialogElement>(null);
  const marks = entry?.marks ?? EMPTY_MARKS;
  const pockets = entry?.pockets ?? [];

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="tooth-sheet-title"
      className="m-auto max-h-[92vh] w-[min(100%-1.5rem,42rem)] overflow-y-auto rounded-2xl border bg-card p-5 text-card-foreground backdrop:bg-black/40"
    >
      <div className="flex flex-col gap-6">
        {/* Stays in view while the long sheet scrolls, so closing it is always one tap away. */}
        <div className="sticky top-0 z-10 -mx-5 -mt-5 flex items-start justify-between gap-4 border-b bg-card px-5 pb-3 pt-5">
          <div>
            <h2 id="tooth-sheet-title" className="text-2xl font-semibold">
              {tooth.number} · {t(`toothTypes.${tooth.type}`)}
            </h2>
            <p className="text-muted-foreground">{t("sheet.roots", { count: tooth.roots })}</p>
          </div>
          <Button type="button" variant="outline" onClick={() => dialog.current?.close()}>
            {t("sheet.close")}
          </Button>
        </div>

        {locked ? <p className="rounded-xl border bg-accent/40 p-3">{t("sheet.locked")}</p> : null}

        <section aria-labelledby="sheet-findings" className="flex flex-col gap-3">
          <h3 id="sheet-findings" className="text-lg font-semibold">
            {t("sheet.findings")}
          </h3>
          {FINDING_CODES.map((code) => renderFinding(code))}
        </section>

        <section aria-labelledby="sheet-procedures" className="flex flex-col gap-3">
          <h3 id="sheet-procedures" className="text-lg font-semibold">
            {t("sheet.procedures")}
          </h3>
          {PROCEDURE_CODES.map((code) => renderProcedure(code))}
        </section>

        <PocketEditor
          jaw={tooth.jaw}
          pockets={pockets}
          locked={locked}
          onChange={(next) => onChange({ pockets: next })}
          onSuggestion={(level) => onChange({ marks: withFinding(marks, "PD", level) })}
          pdSelected={marks.findings.some((finding) => finding.code === "PD")}
          pdBlocked={!canApply(species, tooth, marks, "PD", "2").ok}
        />

        {extras}

        <section aria-labelledby="sheet-note" className="flex flex-col gap-2">
          <h3 id="sheet-note" className="text-lg font-semibold">
            {t("sheet.note")}
          </h3>
          <textarea
            aria-labelledby="sheet-note"
            rows={3}
            maxLength={1000}
            readOnly={locked}
            defaultValue={entry?.note ?? ""}
            // Saved when the field is left, so closing the sheet right after typing keeps the text.
            onBlur={(event) => !locked && onChange({ note: event.target.value })}
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </section>
      </div>
    </dialog>
  );

  function renderFinding(code: FindingCode) {
    const definition = getCode(code)!;
    const current = marks.findings.find((finding) => finding.code === code);
    const levels = definition.levels.length > 0 ? definition.levels : [""];
    if (definition.species && definition.species !== species) return null;

    return (
      <div key={code} className="flex flex-col gap-2">
        <p className="font-medium">{t(`codes.${code}`)}</p>
        <div className="flex flex-wrap gap-2">
          {levels.map((level) => {
            const selected = current?.level === level;
            const allowed = canApply(species, tooth, marks, code, level).ok;
            return (
              <button
                key={level || "-"}
                type="button"
                aria-pressed={selected}
                disabled={locked || (!allowed && !selected)}
                title={allowed || selected ? undefined : refusalText(code, level)}
                onClick={() => onChange({ marks: selected ? withoutCode(marks, code) : withFinding(marks, code, level) })}
                className={`${chipClass} ${selected ? chipOn : "bg-card"}`}
              >
                {level ? t(levelKey(code, level)) : t("sheet.mark")}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderProcedure(code: ProcedureCode) {
    const definition = getCode(code)!;
    const current = marks.procedures.find((procedure) => procedure.code === code);
    const levels = definition.levels.length > 0 ? definition.levels : [""];
    const state: ProcedureState = current?.state ?? "done";

    return (
      <div key={code} className="flex flex-col gap-2">
        <p className="font-medium">{t(`codes.${code}`)}</p>
        <div className="flex flex-wrap items-center gap-2">
          {levels.map((level) => {
            const selected = current?.level === level;
            const allowed = canApply(species, tooth, marks, code, level).ok;
            return (
              <button
                key={level || "-"}
                type="button"
                aria-pressed={selected}
                disabled={locked || (!allowed && !selected)}
                title={allowed || selected ? undefined : refusalText(code, level)}
                onClick={() => onChange({ marks: selected ? withoutCode(marks, code) : withProcedure(marks, code, level, state) })}
                className={`${chipClass} ${selected ? chipOn : "bg-card"}`}
              >
                {level ? t(levelKey(code, level)) : t("sheet.mark")}
              </button>
            );
          })}
          {current ? (
            <button
              type="button"
              disabled={locked}
              onClick={() => onChange({ marks: withProcedureState(marks, code, current.state === "done" ? "planned" : "done") })}
              className={`${chipClass} border-dashed`}
            >
              {t(`state.${current.state}`)}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  function refusalText(code: string, level: string): string {
    const result = canApply(species, tooth, marks, code, level);
    return result.ok ? "" : t(`refusal.${result.reason}`);
  }
}

interface PocketEditorProps {
  jaw: ToothDefinition["jaw"];
  pockets: PocketDepths;
  locked: boolean;
  pdSelected: boolean;
  pdBlocked: boolean;
  onChange: (pockets: PocketDepths) => void;
  onSuggestion: (level: "2" | "3" | "4") => void;
}

/** Six measuring points, entered with big number buttons; the focus moves on by itself. */
function PocketEditor({ jaw, pockets, locked, pdSelected, pdBlocked, onChange, onSuggestion }: PocketEditorProps) {
  const t = useTranslations("dental");
  const [point, setPoint] = useState(0);
  const depths: PocketDepths = pockets.length === POCKET_POINTS.length ? pockets : POCKET_POINTS.map(() => null);
  const suggestion = suggestedPdLevel(depths);
  const deepest = deepestPocket(depths);
  const inner = jaw === "maxilla" ? "palatal" : "lingual";

  function enter(value: number | null) {
    const next = depths.map((depth, index) => (index === point ? value : depth));
    onChange(next);
    // After a value the next point is ready; the last point stays.
    if (value !== null) setPoint((current) => Math.min(POCKET_POINTS.length - 1, current + 1));
  }

  return (
    <section aria-labelledby="sheet-pockets" className="flex flex-col gap-3">
      <h3 id="sheet-pockets" className="text-lg font-semibold">
        {t("pockets.title")}
      </h3>
      <div className="grid grid-cols-3 gap-2">
        {POCKET_POINTS.map((key, index) => {
          const depth = depths[index];
          const deep = depth !== null && depth > DEFAULT_POCKET_THRESHOLD_MM;
          const row = index < 3 ? "buccal" : inner;
          return (
            <button
              key={key}
              type="button"
              disabled={locked}
              aria-pressed={point === index}
              aria-label={`${t(`pockets.rows.${row}`)}, ${t(`pockets.points.${key}`)}: ${depth === null ? t("pockets.none") : `${depth} mm`}`}
              onClick={() => setPoint(index)}
              className={`flex min-h-touch flex-col items-center justify-center rounded-lg border px-2 py-1 ${point === index ? chipOn : "bg-card"} ${deep ? "border-destructive text-destructive" : ""}`}
            >
              <span className="text-xs text-muted-foreground">
                {t(`pockets.rows.${row}`)} · {t(`pockets.points.${key}`)}
              </span>
              <span className="text-xl font-semibold">{depth === null ? "–" : depth}</span>
            </button>
          );
        })}
      </div>
      {!locked ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("pockets.keypad")}>
          {Array.from({ length: MAX_POCKET_MM + 1 }, (_, value) => (
            <button key={value} type="button" onClick={() => enter(value)} className={`${chipClass} bg-card`}>
              {value}
            </button>
          ))}
          <button type="button" onClick={() => enter(null)} className={`${chipClass} bg-card`}>
            {t("pockets.clear")}
          </button>
        </div>
      ) : null}
      <p className="text-sm text-muted-foreground">{t("pockets.threshold", { mm: DEFAULT_POCKET_THRESHOLD_MM })}</p>
      {deepest !== null && deepest > DEFAULT_POCKET_THRESHOLD_MM ? (
        <p className="font-medium text-destructive">{t("pockets.deep", { mm: deepest })}</p>
      ) : null}
      {suggestion && !locked && !pdSelected && !pdBlocked ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-accent/40 p-3">
          <p>{t("pockets.suggestion", { grade: `PD${suggestion}` })}</p>
          <Button type="button" variant="outline" onClick={() => onSuggestion(suggestion)}>
            {t("pockets.apply")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
