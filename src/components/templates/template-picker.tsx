"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { useRequiredOffline } from "@/components/offline/offline-provider";
import type { TextKey } from "@/domain/dental/template";
import type { Species } from "@/domain/teeth/catalog";
import { listTemplates } from "@/lib/offline/templates-store";

interface TemplatePickerProps {
  /** The field of the visit the text goes into; text templates for it (or for any field) are offered. */
  target: TextKey;
  species?: Species;
  /** Called with the chosen template's text; the caller adds it to the field. */
  onPick: (body: string) => void;
}

/** A list of the user's text templates beside a text field. Nothing is shown if there are none, or the plan lacks templates. */
export function TemplatePicker({ target, species, onPick }: TemplatePickerProps) {
  const t = useTranslations("templates");
  const { db, organizationId, features } = useRequiredOffline();
  const templates = useLiveQuery(
    () => (db ? listTemplates(db, organizationId, { kind: "text", textTarget: target, species }) : undefined),
    [db, organizationId, target, species],
  );

  if (!features.includes("templates") || !templates || templates.length === 0) return null;

  return (
    <select
      aria-label={t("pickerLabel")}
      value=""
      onChange={(event) => {
        const chosen = templates.find((template) => template.id === event.target.value);
        if (chosen?.body) onPick(chosen.body);
      }}
      className="h-touch max-w-48 rounded-lg border border-input bg-card px-2 text-base"
    >
      <option value="">{t("pickerPlaceholder")}</option>
      {templates.map((template) => (
        <option key={template.id} value={template.id}>
          {template.shared ? `${template.name} · ${t("sharedShort")}` : template.name}
        </option>
      ))}
    </select>
  );
}
