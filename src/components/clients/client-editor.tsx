"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ClientPatients } from "@/components/clients/client-patients";
import { FormField } from "@/components/forms/form-field";
import { useRequiredOffline } from "@/components/offline/offline-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { parseClientForm, type ClientFormResult, type ClientValidationKey } from "@/lib/offline/client-form";
import type { ClientView } from "@/lib/offline/clients-model";
import { createClient, getClient, removeClient, updateClient } from "@/lib/offline/clients-store";
import { routes } from "@/lib/routes";

/**
 * Create (`id` omitted) or edit a client. Saving writes to the device at once
 * and returns; sending to the server happens in the background.
 */
export function ClientEditor({ id }: { id?: string }) {
  const t = useTranslations("clients");
  const router = useRouter();
  const { db, organizationId, canWrite, canDelete, syncSoon } = useRequiredOffline();

  // `undefined` while loading from the device, `null` when there is no such record.
  const existing = useLiveQuery(async () => (db && id ? ((await getClient(db, id)) ?? null) : undefined), [db, id]);

  if (id && existing === undefined) return <p className="text-muted-foreground">{t("loading")}</p>;
  if (id && existing === null) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-lg">{t("notFound")}</p>
        <Link href={routes.clients} className="font-medium text-primary underline-offset-4 hover:underline">
          {t("back")}
        </Link>
      </div>
    );
  }

  // Remounting on a new record keeps the form's own state simple.
  return (
    <div className="flex flex-col gap-8">
    <EditorForm
      key={existing?.id ?? "new"}
      existing={existing ?? null}
      canWrite={canWrite}
      canDelete={canDelete}
      onSave={async (fields) => {
        if (!db) return;
        if (existing) await updateClient(db, existing.id, fields);
        else await createClient(db, organizationId, fields);
        syncSoon();
        router.push(routes.clients);
      }}
      onDelete={async () => {
        if (!db || !existing) return;
        await removeClient(db, existing.id);
        syncSoon();
        router.push(routes.clients);
      }}
    />
    {existing ? <ClientPatients clientId={existing.id} /> : null}
    </div>
  );
}

interface EditorFormProps {
  existing: ClientView | null;
  canWrite: boolean;
  canDelete: boolean;
  onSave: (fields: Extract<ClientFormResult, { ok: true }>["fields"]) => Promise<void>;
  onDelete: () => Promise<void>;
}

function EditorForm({ existing, canWrite, canDelete, onSave, onDelete }: EditorFormProps) {
  const t = useTranslations("clients");
  const [errors, setErrors] = useState<Partial<Record<string, ClientValidationKey>>>({});
  const [saving, setSaving] = useState(false);

  const readOnly = !canWrite;
  const error = (field: string) => (errors[field] ? t(`validation.${errors[field]}`) : undefined);

  return (
    <form
      className="flex max-w-2xl flex-col gap-5"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        if (readOnly) return;

        const form = event.currentTarget;
        const data = new FormData(form);
        const text = (name: string) => String(data.get(name) ?? "");
        const parsed = parseClientForm({
          fullName: text("fullName"),
          phone: text("phone"),
          email: text("email"),
          address: text("address"),
          notes: text("notes"),
          emailConsent: data.get("emailConsent") === "on",
        });

        if (!parsed.ok) {
          setErrors(parsed.errors);
          return;
        }
        setErrors({});
        setSaving(true);
        try {
          await onSave(parsed.fields);
          // The app keeps pages it navigated away from alive (to preserve their state), so
          // a "new" form would still show what was just saved the next time it is opened.
          if (!existing) form.reset();
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

      <FormField
        label={t("fields.fullName")}
        name="fullName"
        autoComplete="off"
        required
        readOnly={readOnly}
        defaultValue={existing?.fullName ?? ""}
        error={error("fullName")}
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label={t("fields.phone")}
          name="phone"
          type="tel"
          autoComplete="off"
          readOnly={readOnly}
          defaultValue={existing?.phone ?? ""}
          error={error("phone")}
        />
        <FormField
          label={t("fields.email")}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          readOnly={readOnly}
          defaultValue={existing?.email ?? ""}
          error={error("email")}
        />
      </div>
      <FormField
        label={t("fields.address")}
        name="address"
        autoComplete="off"
        readOnly={readOnly}
        defaultValue={existing?.address ?? ""}
        error={error("address")}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="client-notes">{t("fields.notes")}</Label>
        <textarea
          id="client-notes"
          name="notes"
          rows={4}
          readOnly={readOnly}
          defaultValue={existing?.notes ?? ""}
          aria-invalid={error("notes") ? true : undefined}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {error("notes") ? <p className="text-sm text-destructive">{error("notes")}</p> : null}
      </div>

      <label className="flex min-h-touch cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          name="emailConsent"
          defaultChecked={existing?.emailConsent ?? false}
          disabled={readOnly}
          className="size-5 accent-primary"
        />
        <span>{t("fields.emailConsent")}</span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        {!readOnly ? (
          <Button type="submit" disabled={saving}>
            {t("save")}
          </Button>
        ) : null}
        <Link href={routes.clients} className="inline-flex min-h-touch items-center px-2 font-medium text-primary underline-offset-4 hover:underline">
          {t("back")}
        </Link>
        {existing && canDelete ? (
          <Button
            type="button"
            variant="destructive"
            className="ml-auto"
            onClick={async () => {
              if (window.confirm(t("deleteConfirm"))) await onDelete();
            }}
          >
            {t("delete")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
