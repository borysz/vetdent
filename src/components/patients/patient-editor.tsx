"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormField } from "@/components/forms/form-field";
import { useRequiredOffline } from "@/components/offline/offline-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { listClients } from "@/lib/offline/clients-store";
import { parsePatientForm, type PatientValidationKey } from "@/lib/offline/patient-form";
import { SEX_VALUES, SPECIES_VALUES, type PatientView } from "@/lib/offline/patients-model";
import { createPatient, getPatient, removePatient, updatePatient } from "@/lib/offline/patients-store";
import { routes } from "@/lib/routes";

const selectClass = "h-touch w-full rounded-lg border border-input bg-card px-3 text-base disabled:opacity-60";

/**
 * Create (`id` omitted) or edit a patient. Saving writes to the device at once
 * and returns; sending to the server happens in the background.
 */
export function PatientEditor({ id }: { id?: string }) {
  const t = useTranslations("patients");
  const { db, organizationId, canWrite, canDelete } = useRequiredOffline();

  // `undefined` while loading from the device, `null` when there is no such record.
  const existing = useLiveQuery(async () => (db && id ? ((await getPatient(db, id)) ?? null) : undefined), [db, id]);
  const clients = useLiveQuery(() => (db ? listClients(db, organizationId) : undefined), [db, organizationId]);

  if ((id && existing === undefined) || clients === undefined) {
    return <p className="text-muted-foreground">{t("loading")}</p>;
  }
  if (id && existing === null) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-lg">{t("notFound")}</p>
        <Link href={routes.patients} className="font-medium text-primary underline-offset-4 hover:underline">
          {t("back")}
        </Link>
      </div>
    );
  }

  return (
    <EditorForm
      key={existing?.id ?? "new"}
      existing={existing ?? null}
      owners={clients.map((client) => ({ id: client.id, name: client.fullName }))}
      canWrite={canWrite}
      canDelete={canDelete}
    />
  );
}

interface EditorFormProps {
  existing: PatientView | null;
  owners: { id: string; name: string }[];
  canWrite: boolean;
  canDelete: boolean;
}

function EditorForm({ existing, owners, canWrite, canDelete }: EditorFormProps) {
  const t = useTranslations("patients");
  const router = useRouter();
  const preselected = useSearchParams().get("gazdi") ?? "";
  const { db, organizationId, syncSoon } = useRequiredOffline();

  const [errors, setErrors] = useState<Partial<Record<string, PatientValidationKey>>>({});
  const [saving, setSaving] = useState(false);

  const readOnly = !canWrite;
  const error = (field: string) => (errors[field] ? t(`validation.${errors[field]}`) : undefined);

  return (
    <form
      className="flex max-w-2xl flex-col gap-5"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        if (readOnly || !db) return;

        const form = event.currentTarget;
        const data = new FormData(form);
        const text = (name: string) => String(data.get(name) ?? "");
        const parsed = parsePatientForm({
          clientId: text("clientId"),
          name: text("name"),
          // The species select is disabled for an existing patient, so its value comes from the record.
          species: existing ? existing.species : text("species"),
          breed: text("breed"),
          birthDate: text("birthDate"),
          sex: text("sex"),
          neutered: data.get("neutered") === "on",
          weight: text("weight"),
          microchip: text("microchip"),
          notes: text("notes"),
        });

        if (!parsed.ok) {
          setErrors(parsed.errors);
          return;
        }
        setErrors({});
        setSaving(true);
        try {
          if (existing) {
            // The species is fixed once a patient exists; everything else may change.
            const editable: Partial<typeof parsed.fields> = { ...parsed.fields };
            delete editable.species;
            await updatePatient(db, existing.id, editable);
          } else {
            await createPatient(db, organizationId, parsed.fields);
            // The app keeps pages it navigated away from alive (to preserve their state), so
            // a "new" form would still show what was just saved the next time it is opened.
            form.reset();
          }
          syncSoon();
          router.push(routes.patients);
        } finally {
          setSaving(false);
        }
      }}
    >
      {readOnly ? (
        <Alert>
          <AlertDescription>{t("readOnly")}</AlertDescription>
        </Alert>
      ) : null}
      {existing?.problem ? (
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
          <AlertDescription>{existing.problem === "invalid" ? t("problemInvalid") : t("problemForbidden")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="patient-owner">{t("fields.clientId")}</Label>
        <select
          id="patient-owner"
          name="clientId"
          required
          disabled={readOnly}
          defaultValue={existing?.clientId ?? preselected}
          aria-invalid={error("clientId") ? true : undefined}
          className={selectClass}
        >
          <option value="">{t("choose")}</option>
          {owners.map((owner) => (
            <option key={owner.id} value={owner.id}>
              {owner.name}
            </option>
          ))}
        </select>
        {error("clientId") ? <p className="text-sm text-destructive">{error("clientId")}</p> : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label={t("fields.name")}
          name="name"
          autoComplete="off"
          required
          readOnly={readOnly}
          defaultValue={existing?.name ?? ""}
          error={error("name")}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="patient-species">{t("fields.species")}</Label>
          <select
            id="patient-species"
            name="species"
            required
            disabled={readOnly || existing !== null}
            defaultValue={existing?.species ?? ""}
            aria-invalid={error("species") ? true : undefined}
            className={selectClass}
          >
            <option value="">{t("choose")}</option>
            {SPECIES_VALUES.map((species) => (
              <option key={species} value={species}>
                {t(`species.${species}`)}
              </option>
            ))}
          </select>
          {existing ? <p className="text-sm text-muted-foreground">{t("speciesFixed")}</p> : null}
          {error("species") ? <p className="text-sm text-destructive">{error("species")}</p> : null}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label={t("fields.breed")}
          name="breed"
          autoComplete="off"
          readOnly={readOnly}
          defaultValue={existing?.breed ?? ""}
          error={error("breed")}
        />
        <FormField
          label={t("fields.birthDate")}
          name="birthDate"
          type="date"
          readOnly={readOnly}
          defaultValue={existing?.birthDate ?? ""}
          error={error("birthDate")}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="patient-sex">{t("fields.sex")}</Label>
          <select id="patient-sex" name="sex" disabled={readOnly} defaultValue={existing?.sex ?? "unknown"} className={selectClass}>
            {SEX_VALUES.map((sex) => (
              <option key={sex} value={sex}>
                {t(`sex.${sex}`)}
              </option>
            ))}
          </select>
        </div>
        <FormField
          label={t("fields.weightKg")}
          name="weight"
          inputMode="decimal"
          autoComplete="off"
          readOnly={readOnly}
          defaultValue={existing?.weightKg === null || existing?.weightKg === undefined ? "" : String(existing.weightKg)}
          error={error("weightKg")}
        />
      </div>

      <label className="flex min-h-touch cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          name="neutered"
          defaultChecked={existing?.neutered ?? false}
          disabled={readOnly}
          className="size-5 accent-primary"
        />
        <span>{t("fields.neutered")}</span>
      </label>

      <FormField
        label={t("fields.microchip")}
        name="microchip"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        readOnly={readOnly}
        defaultValue={existing?.microchip ?? ""}
        error={error("microchip")}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="patient-notes">{t("fields.notes")}</Label>
        <textarea
          id="patient-notes"
          name="notes"
          rows={4}
          readOnly={readOnly}
          defaultValue={existing?.notes ?? ""}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {error("notes") ? <p className="text-sm text-destructive">{error("notes")}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!readOnly ? (
          <Button type="submit" disabled={saving}>
            {t("save")}
          </Button>
        ) : null}
        <Link href={routes.patients} className="inline-flex min-h-touch items-center px-2 font-medium text-primary underline-offset-4 hover:underline">
          {t("back")}
        </Link>
        {existing && canDelete ? (
          <Button
            type="button"
            variant="destructive"
            className="ml-auto"
            onClick={async () => {
              if (!db || !window.confirm(t("deleteConfirm"))) return;
              await removePatient(db, existing.id);
              syncSoon();
              router.push(routes.patients);
            }}
          >
            {t("delete")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
