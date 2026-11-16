"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { levelKey, quickKey } from "@/components/dental/keys";
import { ToothShape } from "@/components/dental/tooth-shape";
import { ToothSheet } from "@/components/dental/tooth-sheet";
import { badgeOf, getCode } from "@/domain/dental/codes";
import {
  EMPTY_MARKS,
  PROCEDURE_STATES,
  canApply,
  exceedsThreshold,
  selectAll,
  selectArch,
  selectQuadrant,
  selectType,
  toothColor,
  withFinding,
  withProcedure,
  type ProcedureState,
  type RefusalReason,
  type ToothColor,
  type ToothMarks,
} from "@/domain/dental/chart";
import { levelsOf, quickButtonsFor, type QuickButton } from "@/domain/dental/quick-buttons";
import { getOdontogramRows, getTooth, type Quadrant, type Species, type ToothDefinition, type ToothType } from "@/domain/teeth/catalog";
import type { ToothParts, VisitChart } from "@/lib/offline/teeth-store";

const LONG_PRESS_MS = 500;
const MAX_BADGES = 3;

/** One undoable step: what the touched teeth carried before and after. */
interface Step {
  before: ReadonlyMap<number, ToothMarks>;
  after: ReadonlyMap<number, ToothMarks>;
}

interface Brush {
  button: QuickButton;
  level: string;
  state: ProcedureState;
}

type Notice =
  | { kind: "result"; applied: number; skipped: Partial<Record<RefusalReason, number>> }
  | { kind: "offerPolish"; teeth: number[] };

const LEGEND: readonly { color: Exclude<ToothColor, "none">; swatch: string }[] = [
  { color: "red", swatch: "bg-tooth-extract" },
  { color: "blue", swatch: "bg-tooth-endo" },
  { color: "orange", swatch: "bg-tooth-inflamed" },
  { color: "yellow", swatch: "bg-tooth-tartar" },
  { color: "green", swatch: "bg-tooth-healthy" },
  { color: "gray", swatch: "border border-dashed border-tooth-missing" },
];

const QUADRANTS: readonly Quadrant[] = [1, 2, 3, 4];
const TYPES: readonly ToothType[] = ["incisor", "canine", "premolar", "molar"];

interface OdontogramProps {
  species: Species;
  chart: VisitChart;
  /** Final visit, or no right to edit. */
  locked: boolean;
  save: (changes: ReadonlyMap<number, ToothParts>) => Promise<void>;
  /** Told whenever the selection changes (the dictation uses it to find the tooth a note is about). */
  onSelectionChange?: (selected: readonly number[]) => void;
}

/**
 * The dental chart: the upper jaw above, the lower below, the patient's right
 * on the left of the screen. Tap a tooth for its sheet; long-press or "select"
 * for several; the quick-entry panel gives them a finding at once.
 */
export function Odontogram({ species, chart, locked, save, onSelectionChange }: OdontogramProps) {
  const t = useTranslations("dental");
  const rows = getOdontogramRows(species);

  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [brush, setBrush] = useState<Brush | null>(null);
  const [picker, setPicker] = useState<QuickButton | null>(null);
  const [state, setState] = useState<ProcedureState>("done");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [undoStack, setUndoStack] = useState<Step[]>([]);
  const [redoStack, setRedoStack] = useState<Step[]>([]);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  useEffect(() => {
    onSelectionChange?.([...selected]);
  }, [selected, onSelectionChange]);

  const marksOf = (tooth: number): ToothMarks => chart.get(tooth)?.marks ?? EMPTY_MARKS;
  const toParts = (marks: ReadonlyMap<number, ToothMarks>) =>
    new Map<number, ToothParts>([...marks].map(([tooth, value]) => [tooth, { marks: value }]));

  // -- selecting -------------------------------------------------------------

  function toggle(tooth: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(tooth)) next.add(tooth);
      return next;
    });
  }

  function startPress(tooth: number) {
    if (locked) return;
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setSelectMode(true);
      toggle(tooth);
    }, LONG_PRESS_MS);
  }

  function endPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  function onToothClick(tooth: number) {
    // A long press already did its work on release; the click that follows is not a tap.
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (brush && !locked) {
      void apply(brush.button, brush.level, [tooth], brush.state);
      return;
    }
    if (selectMode && !locked) {
      toggle(tooth);
      return;
    }
    setOpen(tooth);
  }

  // -- changing --------------------------------------------------------------

  /** Puts a button's marks on the given teeth, as one undoable step. */
  async function apply(button: QuickButton, level: string, teeth: readonly number[], procedureState: ProcedureState) {
    const before = new Map<number, ToothMarks>();
    const after = new Map<number, ToothMarks>();
    const skipped: Partial<Record<RefusalReason, number>> = {};

    for (const number of teeth) {
      const definition = getTooth(species, number);
      if (!definition) continue;
      const original = marksOf(number);
      let next = original;

      for (const action of button.actions) {
        const code = getCode(action.code);
        if (!code) continue;
        const actionLevel = button.actions.length === 1 ? level : "";
        const verdict = canApply(species, definition, next, action.code, actionLevel);
        if (!verdict.ok) {
          skipped[verdict.reason] = (skipped[verdict.reason] ?? 0) + 1;
          continue;
        }
        next =
          code.kind === "finding"
            ? withFinding(next, action.code as Parameters<typeof withFinding>[1], actionLevel)
            : withProcedure(next, action.code as Parameters<typeof withProcedure>[1], actionLevel, procedureState);
      }
      if (next !== original) {
        before.set(number, original);
        after.set(number, next);
      }
    }

    if (after.size > 0) {
      await save(toParts(after));
      setUndoStack((stack) => [...stack, { before, after }]);
      setRedoStack([]);
    }

    // Tartar removal is followed by polishing; offer it, never force it.
    const offerPolish =
      button.id === "U" && [...after.keys()].filter((tooth) => !marksOf(tooth).procedures.some((p) => p.code === "POL"));
    setNotice(
      offerPolish && offerPolish.length > 0
        ? { kind: "offerPolish", teeth: offerPolish }
        : { kind: "result", applied: after.size, skipped },
    );
  }

  async function clearMarks(teeth: readonly number[]) {
    const before = new Map<number, ToothMarks>();
    const after = new Map<number, ToothMarks>();
    for (const number of teeth) {
      const original = marksOf(number);
      if (original.findings.length === 0 && original.procedures.length === 0) continue;
      before.set(number, original);
      after.set(number, EMPTY_MARKS);
    }
    if (after.size === 0) return;
    await save(toParts(after));
    setUndoStack((stack) => [...stack, { before, after }]);
    setRedoStack([]);
    setNotice({ kind: "result", applied: after.size, skipped: {} });
  }

  async function undo() {
    const step = undoStack[undoStack.length - 1];
    if (!step) return;
    await save(toParts(step.before));
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, step]);
  }

  async function redo() {
    const step = redoStack[redoStack.length - 1];
    if (!step) return;
    await save(toParts(step.after));
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, step]);
  }

  // -- the quick-entry panel ---------------------------------------------------

  function pressButton(button: QuickButton) {
    setNotice(null);
    if (levelsOf(button).length > 0) {
      setPicker(button);
      return;
    }
    run(button, "");
  }

  function run(button: QuickButton, level: string) {
    setPicker(null);
    if (selected.size > 0) {
      void apply(button, level, [...selected], state);
    } else {
      // Nothing selected: the button becomes a brush for the next teeth tapped.
      setBrush({ button, level, state });
    }
  }

  const buttons = quickButtonsFor(species);
  const openDefinition = open === null ? undefined : getTooth(species, open);

  function label(button: QuickButton, level: string): string {
    return level ? `${t(quickKey(button.id))} · ${t(levelKey(button.actions[0].code, level))}` : t(quickKey(button.id));
  }

  return (
    <div className="flex flex-col gap-4">
      {!locked ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={selectMode ? "default" : "outline"}
            aria-pressed={selectMode}
            onClick={() => {
              setSelectMode((current) => !current);
              setBrush(null);
            }}
          >
            {t("toolbar.select")}
          </Button>
          <Button type="button" variant="outline" disabled={undoStack.length === 0} onClick={() => void undo()}>
            {t("toolbar.undo")}
          </Button>
          <Button type="button" variant="outline" disabled={redoStack.length === 0} onClick={() => void redo()}>
            {t("toolbar.redo")}
          </Button>
          <span className="text-sm text-muted-foreground" role="status">
            {t("toolbar.selected", { count: selected.size })}
          </span>
        </div>
      ) : null}

      {selectMode && !locked ? (
        <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-3" role="group" aria-label={t("selection.title")}>
          <Button type="button" variant="outline" onClick={() => setSelected(new Set(selectAll(species)))}>
            {t("selection.all")}
          </Button>
          {QUADRANTS.map((quadrant) => (
            <Button key={quadrant} type="button" variant="outline" onClick={() => setSelected(new Set(selectQuadrant(species, quadrant)))}>
              {t(`selection.quadrant.${quadrant}`)}
            </Button>
          ))}
          <Button type="button" variant="outline" onClick={() => setSelected(new Set(selectArch(species, "upper")))}>
            {t("selection.upper")}
          </Button>
          <Button type="button" variant="outline" onClick={() => setSelected(new Set(selectArch(species, "lower")))}>
            {t("selection.lower")}
          </Button>
          {TYPES.map((type) => (
            <Button key={type} type="button" variant="outline" onClick={() => setSelected(new Set(selectType(species, type)))}>
              {t(`selection.type.${type}`)}
            </Button>
          ))}
          <Button type="button" variant="outline" onClick={() => setSelected(new Set())}>
            {t("selection.clear")}
          </Button>
        </div>
      ) : null}

      {brush && !locked ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary bg-accent p-3" role="status">
          <p className="font-medium">{t("brush.active", { name: label(brush.button, brush.level) })}</p>
          <Button type="button" variant="outline" onClick={() => setBrush(null)}>
            {t("brush.off")}
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto pb-2">
        <p className="mb-1 flex w-max min-w-full justify-between text-sm text-muted-foreground">
          <span>{t("chart.patientRight")}</span>
          <span>{t("chart.patientLeft")}</span>
        </p>
        <div className="flex w-max min-w-full flex-col gap-3">
          {(["upper", "lower"] as const).map((arch) => (
            <div key={arch} className="flex gap-1" role="group" aria-label={t(`chart.${arch}`)}>
              {rows[arch].map((tooth, index) => (
                <ToothCard
                  key={tooth.number}
                  tooth={tooth}
                  separated={index > 0 && rows[arch][index - 1].side !== tooth.side}
                  selected={selected.has(tooth.number)}
                  chart={chart}
                  onClick={() => onToothClick(tooth.number)}
                  onPressStart={() => startPress(tooth.number)}
                  onPressEnd={endPress}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label={t("legend.title")}>
        {LEGEND.map((item) => (
          <li key={item.color} className="flex items-center gap-2">
            <span className={`inline-block size-4 rounded-sm ${item.swatch}`} aria-hidden="true" />
            {t(`legend.${item.color}`)}
          </li>
        ))}
      </ul>

      {notice ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3" role="status">
          {notice.kind === "offerPolish" ? (
            <>
              <p>{t("notice.offerPolish")}</p>
              <Button
                type="button"
                onClick={() => {
                  const polish = quickButtonsFor(species).find((button) => button.id === "POL");
                  if (polish) void apply(polish, "", notice.teeth, state);
                }}
              >
                {t("notice.polishYes")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setNotice(null)}>
                {t("notice.polishNo")}
              </Button>
            </>
          ) : (
            <p>
              {t("notice.applied", { count: notice.applied })}
              {(Object.entries(notice.skipped) as [RefusalReason, number][]).map(([reason, count]) => (
                <span key={reason} className="ml-2 text-muted-foreground">
                  {t("notice.skipped", { count, reason: t(`refusal.${reason}`) })}
                </span>
              ))}
            </p>
          )}
        </div>
      ) : null}

      {!locked ? (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6" role="group" aria-label={t("quick.title")}>
          {picker ? (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("quick.chooseLevel", { name: t(quickKey(picker.id)) })}>
              <span className="font-medium">{t(quickKey(picker.id))}:</span>
              {levelsOf(picker).map((level) => (
                <Button key={level} type="button" variant="outline" onClick={() => run(picker, level)}>
                  {t(levelKey(picker.actions[0].code, level))}
                </Button>
              ))}
              <Button type="button" variant="outline" onClick={() => setPicker(null)}>
                {t("quick.cancel")}
              </Button>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border" role="group" aria-label={t("quick.stateTitle")}>
              {PROCEDURE_STATES.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={state === value}
                  onClick={() => setState(value)}
                  className={`min-h-touch px-3 ${state === value ? "bg-accent font-semibold" : "bg-card"}`}
                >
                  {t(`state.${value}`)}
                </button>
              ))}
            </div>
            {buttons.map((button) => (
              <Button
                key={button.id}
                type="button"
                variant={brush?.button.id === button.id ? "default" : "outline"}
                onClick={() => pressButton(button)}
              >
                {t(quickKey(button.id))}
              </Button>
            ))}
            <Button type="button" variant="outline" disabled={selected.size === 0} onClick={() => void clearMarks([...selected])}>
              {t("quick.clearMarks")}
            </Button>
          </div>
        </div>
      ) : null}

      {openDefinition ? (
        <ToothSheet
          key={openDefinition.number}
          tooth={openDefinition}
          species={species}
          entry={chart.get(openDefinition.number)}
          locked={locked}
          onChange={(parts) => void save(new Map([[openDefinition.number, parts]]))}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

interface ToothCardProps {
  tooth: ToothDefinition;
  separated: boolean;
  selected: boolean;
  chart: VisitChart;
  onClick: () => void;
  onPressStart: () => void;
  onPressEnd: () => void;
}

function ToothCard({ tooth, separated, selected, chart, onClick, onPressStart, onPressEnd }: ToothCardProps) {
  const t = useTranslations("dental");
  const entry = chart.get(tooth.number);
  const marks = entry?.marks ?? EMPTY_MARKS;
  const color = toothColor(marks);
  const deepPocket = entry ? exceedsThreshold(entry.pockets) : false;

  // Short codes, so the meaning does not rest on the colour alone.
  const badges = [
    ...marks.findings.map((finding) => ({ text: badgeOf(finding.code, finding.level), planned: false })),
    ...marks.procedures.map((procedure) => ({ text: badgeOf(procedure.code, procedure.level), planned: procedure.state === "planned" })),
  ];
  const summary = badges.length === 0 ? t("card.noMark") : badges.map((badge) => badge.text).join(", ");

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${tooth.number}, ${t(`toothTypes.${tooth.type}`)}, ${summary}${deepPocket ? `, ${t("card.deepPocket")}` : ""}`}
      onClick={onClick}
      onPointerDown={onPressStart}
      onPointerUp={onPressEnd}
      onPointerLeave={onPressEnd}
      onPointerCancel={onPressEnd}
      onContextMenu={(event) => event.preventDefault()}
      className={`relative flex min-h-touch w-14 shrink-0 select-none flex-col items-center gap-0.5 rounded-lg border bg-card px-1 pb-1 pt-0.5 ${separated ? "ml-3" : ""} ${selected ? "border-primary ring-2 ring-primary" : ""}`}
    >
      <span className="text-sm font-semibold">{tooth.number}</span>
      <ToothShape type={tooth.type} roots={tooth.roots} jaw={tooth.jaw} color={color} className="h-12 w-9" />
      <span className="flex min-h-5 flex-wrap justify-center gap-0.5 text-[0.7rem] leading-none">
        {badges.slice(0, MAX_BADGES).map((badge) => (
          <span key={badge.text} className={`rounded border px-0.5 ${badge.planned ? "border-dashed" : ""}`}>
            {badge.text}
          </span>
        ))}
        {badges.length > MAX_BADGES ? <span>+{badges.length - MAX_BADGES}</span> : null}
      </span>
      {deepPocket ? (
        <span className="absolute right-0.5 top-0.5 rounded-full bg-destructive px-1 text-[0.7rem] font-bold text-white" aria-hidden="true">
          !
        </span>
      ) : null}
      {entry?.note ? (
        <span className="absolute left-0.5 top-0.5 text-[0.7rem]" aria-hidden="true">
          ✎
        </span>
      ) : null}
    </button>
  );
}
