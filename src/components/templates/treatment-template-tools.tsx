"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useRequiredOffline } from "@/components/offline/offline-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EMPTY_MARKS, type RefusalReason, type ToothMarks } from "@/domain/dental/chart";
import {
  TEXT_KEYS,
  applyTemplate,
  groupMarks,
  parsePayload,
  payloadFromVisit,
  serializePayload,
  type TemplatePayload,
  type TextKey,
} from "@/domain/dental/template";
import type { Species } from "@/domain/teeth/catalog";
import { createTemplate, listTemplates } from "@/lib/offline/templates-store";
import type { ToothParts, VisitChart } from "@/lib/offline/teeth-store";
import type { Medication } from "@/lib/offline/visit-lists";

interface TreatmentTemplateToolsProps {
  species: Species;
  chart: VisitChart;
  selectedTeeth: readonly number[];
  /** The visit's text fields and medications as they are now (for saving, and for adding to when loading). */
  texts: Partial<Record<TextKey, string>>;
  medications: readonly Medication[];
  save: (changes: ReadonlyMap<number, ToothParts>) => Promise<void>;
  /** The texts and medications of a loaded template, to be added to the visit. */
  onApplyExtras: (texts: Partial<Record<TextKey, string>>, medications: readonly Medication[]) => void;
}

type Notice = { kind: "loaded"; teeth: number; skipped: Partial<Record<RefusalReason, number>> } | { kind: "needsSelection" } | { kind: "saved" };

/** "Load template" and "Save as template" for the dental chart and the texts of a visit. */
export function TreatmentTemplateTools({ species, chart, selectedTeeth, texts, medications, save, onApplyExtras }: TreatmentTemplateToolsProps) {
  const t = useTranslations("templates");
  const tDental = useTranslations("dental");
  const { db, organizationId, features, templateRights } = useRequiredOffline();
  const [mode, setMode] = useState<"load" | "save" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const templates = useLiveQuery(
    () => (db ? listTemplates(db, organizationId, { kind: "treatment", species }) : undefined),
    [db, organizationId, species],
  );

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (mode && !element.open) element.showModal();
    if (!mode && element.open) element.close();
  }, [mode]);

  if (!features.includes("templates")) return null;

  const marksOf = (tooth: number): ToothMarks => chart.get(tooth)?.marks ?? EMPTY_MARKS;

  async function load(payload: TemplatePayload) {
    const outcome = applyTemplate(payload, species, selectedTeeth, marksOf);
    if (outcome.changes.size > 0) {
      await save(new Map<number, ToothParts>([...outcome.changes].map(([tooth, marks]) => [tooth, { marks }])));
    }
    onApplyExtras(payload.texts, payload.medications);
    setMode(null);
    setNotice(
      outcome.needsSelection
        ? { kind: "needsSelection" }
        : { kind: "loaded", teeth: outcome.changes.size, skipped: outcome.skipped },
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={() => setMode("load")}>
          {t("load")}
        </Button>
        {templateRights.manage ? (
          <Button type="button" variant="outline" onClick={() => setMode("save")}>
            {t("saveFromVisit")}
          </Button>
        ) : null}
      </div>
      {notice ? (
        <p role="status" className="rounded-xl border bg-card p-3">
          {notice.kind === "saved" ? t("saved") : null}
          {notice.kind === "needsSelection" ? t("needsSelection") : null}
          {notice.kind === "loaded" ? (
            <>
              {t("loaded", { count: notice.teeth })}
              {(Object.entries(notice.skipped) as [RefusalReason, number][]).map(([reason, count]) => (
                <span key={reason} className="ml-2 text-muted-foreground">
                  {tDental("notice.skipped", { count, reason: tDental(`refusal.${reason}`) })}
                </span>
              ))}
            </>
          ) : null}
        </p>
      ) : null}

      <dialog
        ref={dialog}
        onClose={() => setMode(null)}
        aria-labelledby="template-dialog-title"
        className="m-auto max-h-[92vh] w-[min(100%-1.5rem,40rem)] overflow-y-auto rounded-2xl border bg-card p-5 text-card-foreground backdrop:bg-black/40"
      >
        {mode === "load" ? (
          <div className="flex flex-col gap-4">
            <h2 id="template-dialog-title" className="text-xl font-semibold">
              {t("loadTitle")}
            </h2>
            <p className="text-muted-foreground">
              {selectedTeeth.length > 0 ? t("loadSelection", { count: selectedTeeth.length }) : t("loadNoSelection")}
            </p>
            {templates && templates.length === 0 ? <p>{t("noTreatmentTemplates")}</p> : null}
            <ul className="flex flex-col gap-2">
              {templates?.map((template) => {
                const payload = parsePayload(template.payload);
                const selectable = payload.teeth.filter((entry) => entry.tooth === null).length;
                return (
                  <li key={template.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                    <div>
                      <p className="font-semibold">
                        {template.name}
                        {template.shared ? <span className="ml-2 text-sm font-normal text-muted-foreground">{t("sharedShort")}</span> : null}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("summary", { fixed: payload.teeth.length - selectable, selectable, medications: payload.medications.length })}
                      </p>
                    </div>
                    <Button type="button" onClick={() => void load(payload)}>
                      {t("loadThis")}
                    </Button>
                  </li>
                );
              })}
            </ul>
            <Button type="button" variant="outline" onClick={() => setMode(null)}>
              {t("close")}
            </Button>
          </div>
        ) : null}

        {mode === "save" ? (
          <SaveForm
            species={species}
            chart={chart}
            texts={texts}
            medications={medications}
            canShare={templateRights.share}
            onCancel={() => setMode(null)}
            onSave={async (fields) => {
              if (!db) return;
              await createTemplate(db, organizationId, fields);
              setMode(null);
              setNotice({ kind: "saved" });
            }}
          />
        ) : null}
      </dialog>
    </div>
  );
}

interface SaveFormProps {
  species: Species;
  chart: VisitChart;
  texts: Partial<Record<TextKey, string>>;
  medications: readonly Medication[];
  canShare: boolean;
  onCancel: () => void;
  onSave: (fields: Parameters<typeof createTemplate>[2]) => Promise<void>;
}

function SaveForm({ species, chart, texts, medications, canShare, onCancel, onSave }: SaveFormProps) {
  const t = useTranslations("templates");
  const tVisit = useTranslations("visits");
  const groups = groupMarks(new Map([...chart].map(([tooth, entry]) => [tooth, entry.marks])));

  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [forBoth, setForBoth] = useState(false);
  // Groups of several teeth default to "teeth chosen on loading".
  const [selectable, setSelectable] = useState<ReadonlySet<string>>(new Set(groups.filter((g) => g.teeth.length > 1).map((g) => g.key)));
  const [textKeys, setTextKeys] = useState<ReadonlySet<TextKey>>(new Set(TEXT_KEYS.filter((key) => texts[key])));
  const [withMedications, setWithMedications] = useState(medications.length > 0);
  const [error, setError] = useState(false);

  const toggle = <T,>(set: ReadonlySet<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (!next.delete(value)) next.add(value);
    return next;
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const payload = payloadFromVisit({
          groups,
          selectable,
          texts: Object.fromEntries([...textKeys].map((key) => [key, texts[key]])),
          medications: withMedications ? medications : [],
        });
        if (name.trim().length === 0) {
          setError(true);
          return;
        }
        void onSave({
          kind: "treatment",
          name: name.trim(),
          shared: canShare && shared,
          species: forBoth ? null : species,
          textTarget: null,
          body: null,
          payload: serializePayload(payload),
        });
      }}
    >
      <h2 id="template-dialog-title" className="text-xl font-semibold">
        {t("saveTitle")}
      </h2>

      <div className="flex flex-col gap-2">
        <Label htmlFor="template-name">{t("name")}</Label>
        <input
          id="template-name"
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={error ? true : undefined}
          className="h-touch w-full rounded-lg border border-input bg-card px-3 text-base"
        />
        {error ? <p className="text-sm text-destructive">{t("nameRequired")}</p> : null}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">{t("teethTitle")}</legend>
        {groups.length === 0 ? <p className="text-muted-foreground">{t("noMarks")}</p> : null}
        {groups.map((group) => (
          <label key={group.key} className="flex min-h-touch cursor-pointer items-start gap-3 rounded-xl border p-3">
            <input
              type="checkbox"
              className="mt-1 size-5 accent-primary"
              checked={selectable.has(group.key)}
              onChange={() => setSelectable((current) => toggle(current, group.key))}
            />
            <span>
              <span className="font-medium">{t("groupTeeth", { teeth: group.teeth.join(", ") })}</span>
              <span className="block text-sm text-muted-foreground">
                {[...group.marks.findings.map((f) => `${f.code}${f.level}`), ...group.marks.procedures.map((p) => `${p.code}${p.level ? `-${p.level}` : ""}`)].join(", ")}
              </span>
              <span className="block text-sm">{t("groupSelectable")}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 font-medium">{t("extrasTitle")}</legend>
        {TEXT_KEYS.filter((key) => texts[key]).map((key) => (
          <label key={key} className="flex min-h-touch items-center gap-3">
            <input type="checkbox" className="size-5 accent-primary" checked={textKeys.has(key)} onChange={() => setTextKeys((current) => toggle(current, key))} />
            {tVisit(`fields.${textFieldKey(key)}`)}
          </label>
        ))}
        {medications.length > 0 ? (
          <label className="flex min-h-touch items-center gap-3">
            <input type="checkbox" className="size-5 accent-primary" checked={withMedications} onChange={() => setWithMedications((current) => !current)} />
            {t("withMedications", { count: medications.length })}
          </label>
        ) : null}
      </fieldset>

      <label className="flex min-h-touch items-center gap-3">
        <input type="checkbox" className="size-5 accent-primary" checked={forBoth} onChange={() => setForBoth((current) => !current)} />
        {t("forBothSpecies")}
      </label>
      {canShare ? (
        <label className="flex min-h-touch items-center gap-3">
          <input type="checkbox" className="size-5 accent-primary" checked={shared} onChange={() => setShared((current) => !current)} />
          {t("shareWithOrganization")}
        </label>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit">{t("save")}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("close")}
        </Button>
      </div>
    </form>
  );
}

/** The key of a text under `visits.fields`, from its stored name. */
function textFieldKey(key: TextKey): "feedingAdvice" | "sutures" | "complaintNotes" | "generalNote" {
  switch (key) {
    case "feeding_advice":
      return "feedingAdvice";
    case "complaint_notes":
      return "complaintNotes";
    case "general_note":
      return "generalNote";
    default:
      return "sutures";
  }
}
