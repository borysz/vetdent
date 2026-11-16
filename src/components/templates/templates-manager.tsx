"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRequiredOffline } from "@/components/offline/offline-provider";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TEXT_KEYS, parsePayload } from "@/domain/dental/template";
import { createTemplate, listTemplates, removeTemplate, updateTemplate } from "@/lib/offline/templates-store";
import type { TemplateView } from "@/lib/offline/templates-model";

const fieldClass = "h-touch w-full rounded-lg border border-input bg-card px-3 text-base";
const areaClass =
  "w-full rounded-lg border border-input bg-card px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type SpeciesChoice = "" | "dog" | "cat";

/** The templates of the organization and of the user: list, rename, delete, and new text templates. */
export function TemplatesManager() {
  const t = useTranslations("templates");
  const { db, organizationId, canWrite, features, templateRights } = useRequiredOffline();
  const templates = useLiveQuery(() => (db ? listTemplates(db, organizationId) : undefined), [db, organizationId]);
  const [editing, setEditing] = useState<string | null>(null);

  if (!features.includes("templates")) {
    return (
      <Alert>
        <AlertDescription>{t("notInPlan")}</AlertDescription>
      </Alert>
    );
  }
  if (templates === undefined) return <p className="text-muted-foreground">{t("loading")}</p>;

  const writable = templateRights.manage && canWrite;
  const mayChange = (template: TemplateView) => writable && (!template.shared || templateRights.share);
  const shared = templates.filter((template) => template.shared);
  const own = templates.filter((template) => !template.shared);

  const section = (title: string, list: TemplateView[], id: string) => (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-xl font-semibold">
        {title}
      </h2>
      {list.length === 0 ? <p className="text-muted-foreground">{t("none")}</p> : null}
      <ul className="flex flex-col gap-3">
        {list.map((template) => (
          <li key={template.id} className="rounded-xl border bg-card p-4">
            {editing === template.id ? (
              <EditForm template={template} canShare={templateRights.share} onDone={() => setEditing(null)} />
            ) : (
              <TemplateRow template={template} canChange={mayChange(template)} onEdit={() => setEditing(template.id)} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      {!writable ? (
        <Alert>
          <AlertDescription>{t("readOnly")}</AlertDescription>
        </Alert>
      ) : null}
      {writable ? (
        <NewTextTemplate
          canShare={templateRights.share}
          onCreate={async (fields) => {
            if (db) await createTemplate(db, organizationId, fields);
          }}
        />
      ) : null}
      {section(t("sharedTitle"), shared, "templates-shared")}
      {section(t("ownTitle"), own, "templates-own")}
    </div>
  );
}

function TemplateRow({ template, canChange, onEdit }: { template: TemplateView; canChange: boolean; onEdit: () => void }) {
  const t = useTranslations("templates");
  const { db, syncSoon } = useRequiredOffline();
  const payload = template.kind === "treatment" ? parsePayload(template.payload) : null;
  const selectable = payload?.teeth.filter((entry) => entry.tooth === null).length ?? 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold">{template.name}</p>
          <p className="text-sm text-muted-foreground">
            {t(`kinds.${template.kind}`)}
            {" · "}
            {template.species ? t(`species.${template.species}`) : t("species.both")}
            {template.kind === "text" ? ` · ${template.textTarget ? t(`targets.${template.textTarget}` as never) : t("targets.any")}` : null}
          </p>
        </div>
        {canChange ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onEdit}>
              {t("edit")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (!db || !window.confirm(t("deleteConfirm", { name: template.name }))) return;
                await removeTemplate(db, template.id);
                syncSoon();
              }}
            >
              {t("delete")}
            </Button>
          </div>
        ) : null}
      </div>
      {template.kind === "text" ? <p className="whitespace-pre-wrap">{template.body}</p> : null}
      {payload ? (
        <p className="text-muted-foreground">
          {t("summary", { fixed: payload.teeth.length - selectable, selectable, medications: payload.medications.length })}
        </p>
      ) : null}
    </div>
  );
}

function EditForm({ template, canShare, onDone }: { template: TemplateView; canShare: boolean; onDone: () => void }) {
  const t = useTranslations("templates");
  const { db, syncSoon } = useRequiredOffline();
  const [name, setName] = useState(template.name);
  const [body, setBody] = useState(template.body ?? "");
  const [target, setTarget] = useState(template.textTarget ?? "");
  const [species, setSpecies] = useState<SpeciesChoice>(template.species ?? "");
  const [shared, setShared] = useState(template.shared);
  const [error, setError] = useState(false);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!db) return;
        if (name.trim().length === 0 || (template.kind === "text" && body.trim().length === 0)) {
          setError(true);
          return;
        }
        await updateTemplate(db, template.id, {
          name: name.trim(),
          shared: canShare ? shared : template.shared,
          species: species === "" ? null : species,
          ...(template.kind === "text" ? { body: body.trim(), textTarget: target === "" ? null : target } : {}),
        });
        syncSoon();
        onDone();
      }}
    >
      <Fields
        kind={template.kind}
        name={name}
        body={body}
        target={target}
        species={species}
        shared={shared}
        canShare={canShare}
        error={error}
        onName={setName}
        onBody={setBody}
        onTarget={setTarget}
        onSpecies={setSpecies}
        onShared={setShared}
      />
      <div className="flex flex-wrap gap-3">
        <Button type="submit">{t("save")}</Button>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

function NewTextTemplate({ canShare, onCreate }: { canShare: boolean; onCreate: (fields: Parameters<typeof createTemplate>[2]) => Promise<void> }) {
  const t = useTranslations("templates");
  const { syncSoon } = useRequiredOffline();
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState("");
  const [species, setSpecies] = useState<SpeciesChoice>("");
  const [shared, setShared] = useState(false);
  const [error, setError] = useState(false);

  return (
    <section aria-labelledby="new-text-template" className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <h2 id="new-text-template" className="text-xl font-semibold">
        {t("newText")}
      </h2>
      <p className="text-muted-foreground">{t("newTextHint")}</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (name.trim().length === 0 || body.trim().length === 0) {
            setError(true);
            return;
          }
          await onCreate({
            kind: "text",
            name: name.trim(),
            shared: canShare && shared,
            species: species === "" ? null : species,
            textTarget: target === "" ? null : target,
            body: body.trim(),
            payload: null,
          });
          syncSoon();
          // The page is kept alive when navigated away from, so the form is emptied after saving.
          setName("");
          setBody("");
          setTarget("");
          setSpecies("");
          setShared(false);
          setError(false);
        }}
      >
        <Fields
          kind="text"
          name={name}
          body={body}
          target={target}
          species={species}
          shared={shared}
          canShare={canShare}
          error={error}
          onName={setName}
          onBody={setBody}
          onTarget={setTarget}
          onSpecies={setSpecies}
          onShared={setShared}
        />
        <div>
          <Button type="submit">{t("create")}</Button>
        </div>
      </form>
    </section>
  );
}

interface FieldsProps {
  kind: TemplateView["kind"];
  name: string;
  body: string;
  target: string;
  species: SpeciesChoice;
  shared: boolean;
  canShare: boolean;
  error: boolean;
  onName: (value: string) => void;
  onBody: (value: string) => void;
  onTarget: (value: string) => void;
  onSpecies: (value: SpeciesChoice) => void;
  onShared: (value: boolean) => void;
}

function Fields({ kind, name, body, target, species, shared, canShare, error, onName, onBody, onTarget, onSpecies, onShared }: FieldsProps) {
  const t = useTranslations("templates");
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="tpl-name">{t("name")}</Label>
        <input id="tpl-name" value={name} maxLength={100} onChange={(event) => onName(event.target.value)} aria-invalid={error && name.trim() === "" ? true : undefined} className={fieldClass} />
      </div>
      {kind === "text" ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tpl-target">{t("target")}</Label>
            <select id="tpl-target" value={target} onChange={(event) => onTarget(event.target.value)} className={fieldClass}>
              <option value="">{t("targets.any")}</option>
              {TEXT_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(`targets.${key}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="tpl-body">{t("body")}</Label>
            <textarea id="tpl-body" rows={5} maxLength={4000} value={body} onChange={(event) => onBody(event.target.value)} aria-invalid={error && body.trim() === "" ? true : undefined} className={areaClass} />
          </div>
        </>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor="tpl-species">{t("speciesLabel")}</Label>
        <select id="tpl-species" value={species} onChange={(event) => onSpecies(event.target.value as SpeciesChoice)} className={fieldClass}>
          <option value="">{t("species.both")}</option>
          <option value="dog">{t("species.dog")}</option>
          <option value="cat">{t("species.cat")}</option>
        </select>
      </div>
      {canShare ? (
        <label className="flex min-h-touch items-center gap-3">
          <input type="checkbox" className="size-5 accent-primary" checked={shared} onChange={(event) => onShared(event.target.checked)} />
          {t("shareWithOrganization")}
        </label>
      ) : null}
      {error ? <p className="text-sm text-destructive">{t("fillRequired")}</p> : null}
    </>
  );
}
