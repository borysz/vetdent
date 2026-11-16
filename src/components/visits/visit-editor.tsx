"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { FormField } from "@/components/forms/form-field";
import { useRequiredOffline } from "@/components/offline/offline-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { clientOps } from "@/lib/offline/clients-model";
import { getPatient } from "@/lib/offline/patients-store";
import {
  ageOf,
  parseWeight,
  suggestedFollowUp,
  textOrNull,
  toInputDateTime,
  toStoredDateTime,
  validFollowUpDate,
  validVisitDate,
  type VisitValidationKey,
} from "@/lib/offline/visit-form";
import { finalizeVisit, reopenVisit, type LifecycleError } from "@/lib/offline/visit-lifecycle";
import {
  BLOCK_SIDES,
  COMPLAINT_TAGS,
  EMPTY_BLOCK,
  EMPTY_MEDICATION,
  MAX_BLOCKS,
  MAX_MEDICATIONS,
  parseBlocks,
  parseMedications,
  parseTags,
  serializeBlocks,
  serializeMedications,
  serializeTags,
  type AnesthesiaBlock,
  type Medication,
} from "@/lib/offline/visit-lists";
import type { VisitFields, VisitView } from "@/lib/offline/visits-model";
import { getVisit, removeVisit, updateVisit } from "@/lib/offline/visits-store";
import { patientPath, routes } from "@/lib/routes";

const selectClass = "h-touch w-full rounded-lg border border-input bg-card px-3 text-base disabled:opacity-60";
const textareaClass =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";
const SAVE_DELAY_MS = 500;
const SECTIONS = ["header", "history", "dental", "procedures", "aftercare"] as const;

/** The treatment record of one visit: one scrolling page, saved to the device as you type. */
export function VisitEditor({ id }: { id: string }) {
  const t = useTranslations("visits");
  const { db } = useRequiredOffline();

  // `undefined` while loading from the device, `null` when there is no such record.
  const visit = useLiveQuery(async () => (db ? ((await getVisit(db, id)) ?? null) : undefined), [db, id]);
  const context = useLiveQuery(async () => {
    if (!db || !visit) return undefined;
    const patient = await getPatient(db, visit.patientId);
    const owner = patient ? await db.clients.get(patient.clientId) : undefined;
    return { patient, ownerName: owner ? clientOps.viewOf(owner).fullName : "" };
  }, [db, visit?.patientId]);

  if (visit === undefined || (visit && context === undefined)) {
    return <p className="text-muted-foreground">{t("loading")}</p>;
  }
  if (visit === null) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-lg">{t("notFound")}</p>
        <Link href={routes.patients} className="font-medium text-primary underline-offset-4 hover:underline">
          {t("back")}
        </Link>
      </div>
    );
  }

  // The form restarts when the visit changes between draft and final, so it shows the server's values.
  return <VisitForm key={`${visit.id}:${visit.status}`} visit={visit} patient={context?.patient ?? null} ownerName={context?.ownerName ?? ""} />;
}

interface VisitFormProps {
  visit: VisitView;
  patient: Awaited<ReturnType<typeof getPatient>>;
  ownerName: string;
}

function VisitForm({ visit, patient, ownerName }: VisitFormProps) {
  const t = useTranslations("visits");
  const tPatients = useTranslations("patients");
  const format = useFormatter();
  const router = useRouter();
  const { db, organizationId, canWrite, visitRights, status, syncNow, syncSoon } = useRequiredOffline();

  const locked = visit.status === "final" || !visitRights.write || !canWrite;

  const [visitDate, setVisitDate] = useState(visit.visitDate);
  const [veterinarian, setVeterinarian] = useState(visit.veterinarianName ?? "");
  const [assistant, setAssistant] = useState(visit.assistantName ?? "");
  const [asa, setAsa] = useState(visit.asaStatus === null ? "" : String(visit.asaStatus));
  const [lastFed, setLastFed] = useState(toInputDateTime(visit.lastFedAt));
  const [blood, setBlood] = useState(visit.bloodSummary ?? "");
  const [weight, setWeight] = useState(visit.weightKg === null ? "" : String(visit.weightKg));
  const [tags, setTags] = useState(() => parseTags(visit.complaintTags));
  const [complaintNotes, setComplaintNotes] = useState(visit.complaintNotes ?? "");
  const [brushing, setBrushing] = useState(visit.homeBrushing ?? "");
  const [diet, setDiet] = useState(visit.dietType ?? "");
  const [blocks, setBlocks] = useState<AnesthesiaBlock[]>(() => parseBlocks(visit.anesthesiaBlocks));
  const [sutures, setSutures] = useState(visit.sutures ?? "");
  const [medications, setMedications] = useState<Medication[]>(() => parseMedications(visit.medications));
  const [feedingAdvice, setFeedingAdvice] = useState(visit.feedingAdvice ?? "");
  const [followUp, setFollowUp] = useState(visit.followUpDate ?? "");

  const [errors, setErrors] = useState<Partial<Record<string, VisitValidationKey>>>({});
  const [saving, setSaving] = useState(false);
  const queued = useRef<Partial<Omit<VisitFields, "patientId">>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const error = (field: string) => (errors[field] ? t(`validation.${errors[field]}`) : undefined);
  const setError = (field: string, key: VisitValidationKey | undefined) =>
    setErrors((current) => ({ ...current, [field]: key }));

  /** Writes what has been queued to the device. Also runs when leaving the page, so nothing typed is lost. */
  async function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const patch = queued.current;
    queued.current = {};
    if (!db || Object.keys(patch).length === 0) {
      setSaving(false);
      return;
    }
    await updateVisit(db, visit.id, patch);
    setSaving(false);
    syncSoon();
  }

  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => () => void flushRef.current(), []);

  function save(patch: Partial<Omit<VisitFields, "patientId">>) {
    if (locked) return;
    queued.current = { ...queued.current, ...patch };
    setSaving(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }

  /** Text fields: kept as typed on screen, stored trimmed (`null` when blank). */
  const textSaver = (set: (value: string) => void, field: keyof Omit<VisitFields, "patientId">, max: number) => (value: string) => {
    set(value);
    if (value.trim().length > max) {
      setError(field, "tooLong");
      return;
    }
    setError(field, undefined);
    save({ [field]: textOrNull(value) } as Partial<VisitFields>);
  };

  const age = ageOf(patient?.birthDate ?? null);
  const readyForFinalize = visit.readyToFinalize;

  return (
    <div className="flex max-w-3xl flex-col gap-8 pb-16">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <nav aria-label={t("sectionNav")} className="flex flex-wrap gap-x-4">
          {SECTIONS.map((section) => (
            <a
              key={section}
              href={`#visit-${section}`}
              className="min-h-touch content-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {t(`sections.${section}`)}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm" role="status">
          <span className="rounded-full border px-3 py-1 font-medium">{t(`status.${visit.status}`)}</span>
          {readyForFinalize && visit.status === "draft" ? (
            <span className="rounded-full bg-accent px-3 py-1 font-medium">{t("readyBadge")}</span>
          ) : null}
          <span className="text-muted-foreground">
            {saving
              ? t("saveState.saving")
              : visit.hasPendingChanges || status.pending > 0
                ? t("saveState.savedOnDevice")
                : t("saveState.synced")}
          </span>
        </div>
      </div>

      {visit.status === "final" ? (
        <Alert>
          <AlertDescription>
            {t("finalNotice")}
            {visit.finalizedAt ? ` ${t("finalizedAt", { date: format.dateTime(new Date(visit.finalizedAt), { dateStyle: "medium", timeStyle: "short" }) })}` : ""}
          </AlertDescription>
        </Alert>
      ) : !canWrite ? (
        <Alert>
          <AlertDescription>{t("readOnlyAccount")}</AlertDescription>
        </Alert>
      ) : !visitRights.write ? (
        <Alert>
          <AlertDescription>{t("readOnlyRights")}</AlertDescription>
        </Alert>
      ) : null}
      {visit.problem ? (
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
          <AlertDescription>{visit.problem === "invalid" ? t("problemInvalid") : t("problemForbidden")}</AlertDescription>
        </Alert>
      ) : null}

      <fieldset disabled={locked} className="flex min-w-0 flex-col gap-8">
        <section id="visit-header" aria-labelledby="visit-header-title" className="flex scroll-mt-24 flex-col gap-5">
          <h2 id="visit-header-title" className="text-xl font-semibold">
            {t("sections.header")}
          </h2>
          <dl className="grid gap-x-6 gap-y-2 rounded-xl border bg-card p-4 sm:grid-cols-2">
            <Info label={t("header.owner")} value={ownerName || t("header.unknown")} />
            <Info label={t("header.patient")} value={patient?.name ?? t("header.unknown")} />
            <Info label={t("header.species")} value={patient ? tPatients(`species.${patient.species}`) : t("header.unknown")} />
            <Info label={t("header.breed")} value={patient?.breed ?? t("header.unknown")} />
            <Info label={t("header.age")} value={age ? t("header.ageValue", age) : t("header.unknown")} />
            <Info label={t("header.neutered")} value={patient ? (patient.neutered ? t("header.yes") : t("header.no")) : t("header.unknown")} />
            <Info
              label={t("header.weight")}
              value={patient?.weightKg != null ? `${patient.weightKg} kg` : t("header.unknown")}
            />
          </dl>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label={t("fields.visitDate")}
              type="date"
              required
              value={visitDate}
              error={error("visitDate")}
              onChange={(event) => {
                const value = event.target.value;
                setVisitDate(value);
                if (!validVisitDate(value)) {
                  setError("visitDate", "dateInvalid");
                  return;
                }
                setError("visitDate", undefined);
                save({ visitDate: value });
              }}
            />
            <FormField
              label={t("fields.veterinarianName")}
              autoComplete="off"
              value={veterinarian}
              error={error("veterinarianName")}
              onChange={(event) => textSaver(setVeterinarian, "veterinarianName", 200)(event.target.value)}
            />
            <FormField
              label={t("fields.assistantName")}
              autoComplete="off"
              value={assistant}
              error={error("assistantName")}
              onChange={(event) => textSaver(setAssistant, "assistantName", 200)(event.target.value)}
            />
            <div className="flex flex-col gap-2">
              <Label htmlFor="visit-asa">{t("fields.asaStatus")}</Label>
              <select
                id="visit-asa"
                className={selectClass}
                value={asa}
                onChange={(event) => {
                  setAsa(event.target.value);
                  save({ asaStatus: event.target.value === "" ? null : Number(event.target.value) });
                }}
              >
                <option value="">{t("choose")}</option>
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {t("asaOption", { value })}
                  </option>
                ))}
              </select>
            </div>
            <FormField
              label={t("fields.lastFedAt")}
              type="datetime-local"
              value={lastFed}
              error={error("lastFedAt")}
              onChange={(event) => {
                const value = event.target.value;
                setLastFed(value);
                const stored = toStoredDateTime(value);
                if (stored === "invalid") {
                  setError("lastFedAt", "dateTimeInvalid");
                  return;
                }
                setError("lastFedAt", undefined);
                save({ lastFedAt: stored });
              }}
            />
            <FormField
              label={t("fields.weightKg")}
              inputMode="decimal"
              autoComplete="off"
              placeholder={patient?.weightKg != null ? String(patient.weightKg) : undefined}
              value={weight}
              error={error("weightKg")}
              onChange={(event) => {
                const value = event.target.value;
                setWeight(value);
                const parsed = parseWeight(value);
                if (parsed === "invalid") {
                  setError("weightKg", "weightInvalid");
                  return;
                }
                setError("weightKg", undefined);
                save({ weightKg: parsed });
              }}
            />
          </div>
          <LongText
            id="visit-blood"
            label={t("fields.bloodSummary")}
            rows={2}
            value={blood}
            error={error("bloodSummary")}
            onChange={textSaver(setBlood, "bloodSummary", 1000)}
          />
        </section>

        <section id="visit-history" aria-labelledby="visit-history-title" className="flex scroll-mt-24 flex-col gap-5">
          <h2 id="visit-history-title" className="text-xl font-semibold">
            {t("sections.history")}
          </h2>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-medium">{t("fields.complaintTags")}</legend>
            <div className="flex flex-wrap gap-2">
              {COMPLAINT_TAGS.map((tag) => {
                const selected = tags.includes(tag);
                return (
                  <label
                    key={tag}
                    className={`flex min-h-touch cursor-pointer items-center gap-2 rounded-full border px-4 ${selected ? "border-primary bg-accent" : "bg-card"}`}
                  >
                    <input
                      type="checkbox"
                      className="size-5 accent-primary"
                      checked={selected}
                      onChange={() => {
                        const next = parseTags(selected ? tags.filter((item) => item !== tag) : [...tags, tag]);
                        setTags(next);
                        save({ complaintTags: serializeTags(next) });
                      }}
                    />
                    {t(`tags.${tag}`)}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <LongText
            id="visit-complaint-notes"
            label={t("fields.complaintNotes")}
            value={complaintNotes}
            error={error("complaintNotes")}
            onChange={textSaver(setComplaintNotes, "complaintNotes", 2000)}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label={t("fields.homeBrushing")}
              autoComplete="off"
              value={brushing}
              error={error("homeBrushing")}
              onChange={(event) => textSaver(setBrushing, "homeBrushing", 200)(event.target.value)}
            />
            <FormField
              label={t("fields.dietType")}
              autoComplete="off"
              value={diet}
              error={error("dietType")}
              onChange={(event) => textSaver(setDiet, "dietType", 200)(event.target.value)}
            />
          </div>
        </section>

        <section id="visit-dental" aria-labelledby="visit-dental-title" className="flex scroll-mt-24 flex-col gap-3">
          <h2 id="visit-dental-title" className="text-xl font-semibold">
            {t("sections.dental")}
          </h2>
          <p className="rounded-xl border border-dashed p-4 text-muted-foreground">{t("dentalSoon")}</p>
        </section>

        <section id="visit-procedures" aria-labelledby="visit-procedures-title" className="flex scroll-mt-24 flex-col gap-5">
          <h2 id="visit-procedures-title" className="text-xl font-semibold">
            {t("sections.procedures")}
          </h2>
          <div className="flex flex-col gap-3">
            <h3 className="font-medium">{t("blocks.title")}</h3>
            {blocks.length === 0 ? <p className="text-muted-foreground">{t("blocks.empty")}</p> : null}
            {blocks.map((block, index) => (
              <div key={index} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
                <FormField
                  label={t("blocks.nerve")}
                  autoComplete="off"
                  value={block.nerve}
                  onChange={(event) => updateBlock(index, { nerve: event.target.value })}
                />
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`block-side-${index}`}>{t("blocks.side")}</Label>
                  <select
                    id={`block-side-${index}`}
                    className={selectClass}
                    value={block.side}
                    onChange={(event) => updateBlock(index, { side: event.target.value })}
                  >
                    {BLOCK_SIDES.map((side) => (
                      <option key={side} value={side}>
                        {t(`blocks.sides.${side === "" ? "none" : side}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <FormField
                  label={t("blocks.agent")}
                  autoComplete="off"
                  value={block.agent}
                  onChange={(event) => updateBlock(index, { agent: event.target.value })}
                />
                <FormField
                  label={t("blocks.dose")}
                  autoComplete="off"
                  value={block.dose}
                  onChange={(event) => updateBlock(index, { dose: event.target.value })}
                />
                <div className="sm:col-span-2">
                  <Button type="button" variant="outline" onClick={() => removeBlock(index)}>
                    {t("blocks.remove")}
                  </Button>
                </div>
              </div>
            ))}
            {blocks.length < MAX_BLOCKS ? (
              <div>
                <Button type="button" variant="outline" onClick={() => setBlocks([...blocks, { ...EMPTY_BLOCK }])}>
                  {t("blocks.add")}
                </Button>
              </div>
            ) : null}
          </div>
          <LongText
            id="visit-sutures"
            label={t("fields.sutures")}
            value={sutures}
            error={error("sutures")}
            onChange={textSaver(setSutures, "sutures", 2000)}
          />
        </section>

        <section id="visit-aftercare" aria-labelledby="visit-aftercare-title" className="flex scroll-mt-24 flex-col gap-5">
          <h2 id="visit-aftercare-title" className="text-xl font-semibold">
            {t("sections.aftercare")}
          </h2>
          <div className="flex flex-col gap-3">
            <h3 className="font-medium">{t("medications.title")}</h3>
            {medications.length === 0 ? <p className="text-muted-foreground">{t("medications.empty")}</p> : null}
            {medications.map((medication, index) => (
              <div key={index} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
                <FormField
                  label={t("medications.name")}
                  autoComplete="off"
                  value={medication.name}
                  onChange={(event) => updateMedication(index, { name: event.target.value })}
                />
                <FormField
                  label={t("medications.dose")}
                  autoComplete="off"
                  value={medication.dose}
                  onChange={(event) => updateMedication(index, { dose: event.target.value })}
                />
                <FormField
                  label={t("medications.frequency")}
                  autoComplete="off"
                  value={medication.frequency}
                  onChange={(event) => updateMedication(index, { frequency: event.target.value })}
                />
                <FormField
                  label={t("medications.duration")}
                  autoComplete="off"
                  value={medication.duration}
                  onChange={(event) => updateMedication(index, { duration: event.target.value })}
                />
                <div className="sm:col-span-2">
                  <Button type="button" variant="outline" onClick={() => removeMedication(index)}>
                    {t("medications.remove")}
                  </Button>
                </div>
              </div>
            ))}
            {medications.length < MAX_MEDICATIONS ? (
              <div>
                <Button type="button" variant="outline" onClick={() => setMedications([...medications, { ...EMPTY_MEDICATION }])}>
                  {t("medications.add")}
                </Button>
              </div>
            ) : null}
          </div>
          <LongText
            id="visit-feeding"
            label={t("fields.feedingAdvice")}
            value={feedingAdvice}
            error={error("feedingAdvice")}
            onChange={textSaver(setFeedingAdvice, "feedingAdvice", 2000)}
          />
          <div className="flex flex-col gap-2">
            <FormField
              label={t("fields.followUpDate")}
              type="date"
              value={followUp}
              error={error("followUpDate")}
              hint={sutures.trim() ? t("followUpHint") : undefined}
              onChange={(event) => changeFollowUp(event.target.value)}
            />
            {suggestedFollowUp(visitDate) ? (
              <div>
                <Button type="button" variant="outline" onClick={() => changeFollowUp(suggestedFollowUp(visitDate) ?? "")}>
                  {t("followUpSuggest")}
                </Button>
              </div>
            ) : null}
          </div>
        </section>
      </fieldset>

      <Lifecycle visit={visit} flush={flush} syncNow={syncNow} organizationId={organizationId} />

      {visit.status === "draft" && visitRights.write && canWrite ? (
        <div>
          <Button
            type="button"
            variant="destructive"
            onClick={async () => {
              if (!db || !window.confirm(t("deleteConfirm"))) return;
              queued.current = {};
              if (timer.current) clearTimeout(timer.current);
              await removeVisit(db, visit.id);
              syncSoon();
              router.push(patientPath(visit.patientId));
            }}
          >
            {t("delete")}
          </Button>
        </div>
      ) : null}
      <div>
        <Link
          href={patientPath(visit.patientId)}
          className="min-h-touch content-center px-2 font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("back")}
        </Link>
      </div>
    </div>
  );

  function changeFollowUp(value: string) {
    setFollowUp(value);
    if (value !== "" && !validFollowUpDate(value)) {
      setError("followUpDate", "followUpInvalid");
      return;
    }
    setError("followUpDate", undefined);
    save({ followUpDate: value === "" ? null : value });
  }

  function updateBlock(index: number, patch: Partial<AnesthesiaBlock>) {
    const next = blocks.map((block, position) => (position === index ? { ...block, ...patch } : block));
    setBlocks(next);
    save({ anesthesiaBlocks: serializeBlocks(next) });
  }

  function removeBlock(index: number) {
    const next = blocks.filter((_, position) => position !== index);
    setBlocks(next);
    save({ anesthesiaBlocks: serializeBlocks(next) });
  }

  function updateMedication(index: number, patch: Partial<Medication>) {
    const next = medications.map((medication, position) => (position === index ? { ...medication, ...patch } : medication));
    setMedications(next);
    save({ medications: serializeMedications(next) });
  }

  function removeMedication(index: number) {
    const next = medications.filter((_, position) => position !== index);
    setMedications(next);
    save({ medications: serializeMedications(next) });
  }
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

interface LongTextProps {
  id: string;
  label: string;
  value: string;
  rows?: number;
  error?: string;
  onChange: (value: string) => void;
}

function LongText({ id, label, value, rows = 3, error, onChange }: LongTextProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={textareaClass}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

interface LifecycleProps {
  visit: VisitView;
  organizationId: string;
  flush: () => Promise<void>;
  syncNow: () => Promise<void>;
}

/** Finalise / reopen (online, server-checked) and the "ready to finalise" mark for when that is not possible. */
function Lifecycle({ visit, organizationId, flush, syncNow }: LifecycleProps) {
  const t = useTranslations("visits.lifecycle");
  const tErrors = useTranslations("visits.lifecycleErrors");
  const { db, canWrite, visitRights, status, syncSoon } = useRequiredOffline();

  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<LifecycleError | "waitForSync" | null>(null);
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");

  const online = status.online;
  const draft = visit.status === "draft";

  async function finalize() {
    if (!db || !window.confirm(t("finalizeConfirm"))) return;
    setBusy(true);
    setFailure(null);
    try {
      // What was typed must reach the server first, or the finalised copy would miss it.
      await flush();
      await syncNow();
      const current = await getVisit(db, visit.id);
      if (!current || current.hasPendingChanges || current.isNew) {
        setFailure("waitForSync");
        return;
      }
      const result = await finalizeVisit(createSupabaseBrowserClient(), organizationId, visit.id);
      if (!result.ok) {
        setFailure(result.error);
        return;
      }
      await syncNow();
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    setBusy(true);
    setFailure(null);
    try {
      const result = await reopenVisit(createSupabaseBrowserClient(), organizationId, visit.id, reason);
      if (!result.ok) {
        setFailure(result.error);
        return;
      }
      setReopening(false);
      setReason("");
      await syncNow();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={t("finalize")} className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
      {failure ? (
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
          <AlertDescription>{failure === "waitForSync" ? t("waitForSync") : tErrors(failure)}</AlertDescription>
        </Alert>
      ) : null}

      {draft ? (
        <>
          {visit.readyToFinalize && visitRights.finalize && online ? <p className="font-medium">{t("readyOffer")}</p> : null}
          {visitRights.finalize ? (
            online ? (
              <div>
                <Button type="button" disabled={busy || !canWrite} onClick={() => void finalize()}>
                  {busy ? t("finalizing") : t("finalize")}
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground">{t("offlineHint")}</p>
            )
          ) : (
            <p className="text-muted-foreground">{t("noRightHint")}</p>
          )}
          {visitRights.write && canWrite && (!visitRights.finalize || !online) ? (
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  await flush();
                  if (!db) return;
                  await updateVisit(db, visit.id, { readyToFinalize: !visit.readyToFinalize });
                  syncSoon();
                }}
              >
                {visit.readyToFinalize ? t("unmarkReady") : t("markReady")}
              </Button>
            </div>
          ) : null}
        </>
      ) : visitRights.reopen ? (
        online ? (
          reopening ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void reopen();
              }}
            >
              <h3 className="font-medium">{t("reopenTitle")}</h3>
              <p className="text-muted-foreground">{t("reopenBody")}</p>
              <Label htmlFor="reopen-reason">{t("reopenReason")}</Label>
              <textarea
                id="reopen-reason"
                rows={3}
                required
                minLength={3}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className={textareaClass}
              />
              <div className="flex flex-wrap gap-3">
                <Button type="submit" disabled={busy}>
                  {busy ? t("reopening") : t("reopenSubmit")}
                </Button>
                <Button type="button" variant="outline" onClick={() => setReopening(false)}>
                  {t("cancel")}
                </Button>
              </div>
            </form>
          ) : (
            <div>
              <Button type="button" variant="outline" onClick={() => setReopening(true)}>
                {t("reopen")}
              </Button>
            </div>
          )
        ) : (
          <p className="text-muted-foreground">{tErrors("offline")}</p>
        )
      ) : null}
    </section>
  );
}
