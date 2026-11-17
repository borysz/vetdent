"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useRequiredOffline } from "@/components/offline/offline-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ALLOWED_TYPES, isImage, type FileError } from "@/lib/offline/attachment-file";
import { ATTACHMENT_KINDS, storagePath, type AttachmentKind } from "@/lib/offline/attachments-model";
import {
  addAttachment,
  listAttachmentsOfVisit,
  removeAttachment,
  retryRefusedFiles,
  updateAttachment,
  type AttachmentListItem,
} from "@/lib/offline/attachments-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getTeeth, type Species } from "@/domain/teeth/catalog";

const selectClass = "h-touch rounded-lg border border-input bg-card px-3 text-base";
const SIGNED_URL_SECONDS = 3600;

/** Signed links are asked for once per file and reused until shortly before they expire. */
const signedUrls = new Map<string, { url: string; expires: number }>();

async function signedUrl(organizationId: string, id: string): Promise<string | null> {
  const key = storagePath(organizationId, id);
  const cached = signedUrls.get(key);
  if (cached && cached.expires > Date.now() + 60_000) return cached.url;
  const { data, error } = await createSupabaseBrowserClient().storage.from("attachments").createSignedUrl(key, SIGNED_URL_SECONDS);
  if (error || !data) return null;
  signedUrls.set(key, { url: data.signedUrl, expires: Date.now() + SIGNED_URL_SECONDS * 1000 });
  return data.signedUrl;
}

/** An address the browser can show: the picture kept on this device if there is one, otherwise a signed link. */
export function useSource(item: AttachmentListItem, wantFull: boolean): string | null {
  const { organizationId, status } = useRequiredOffline();
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    let revoke: string | null = null;
    let cancelled = false;
    const local = wantFull ? (item.localBlob ?? null) : (item.thumbnail ?? item.localBlob ?? null);

    if (local && (isImage(local.type) || !wantFull)) {
      revoke = URL.createObjectURL(local);
      queueMicrotask(() => !cancelled && setSource(revoke));
    } else if (item.uploaded && status.online) {
      void signedUrl(organizationId, item.id).then((url) => !cancelled && setSource(url));
    } else {
      queueMicrotask(() => !cancelled && setSource(null));
    }
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [item.id, item.uploaded, item.thumbnail, item.localBlob, organizationId, status.online, wantFull]);

  return source;
}

interface AttachmentsPanelProps {
  visitId: string;
  species: Species;
  /** The teeth selected on the chart: a before/after photo goes to the one that is selected. */
  selectedTeeth?: readonly number[];
  /** A fixed tooth: only its attachments are shown, and new ones are attached to it. */
  tooth?: number;
  /** Final visit, or no right to change: look but do not add or remove. */
  locked: boolean;
}

type Target = { kind: "visit" } | { kind: "quadrant"; quadrant: number } | { kind: "tooth"; tooth: number };

const targetValue = (target: Target) =>
  target.kind === "visit" ? "visit" : target.kind === "quadrant" ? `q${target.quadrant}` : `t${target.tooth}`;

function parseTarget(value: string): Target {
  if (value.startsWith("q")) return { kind: "quadrant", quadrant: Number(value.slice(1)) };
  if (value.startsWith("t")) return { kind: "tooth", tooth: Number(value.slice(1)) };
  return { kind: "visit" };
}

function targetOf(item: AttachmentListItem): Target {
  if (item.tooth !== null) return { kind: "tooth", tooth: item.tooth };
  if (item.quadrant !== null) return { kind: "quadrant", quadrant: item.quadrant };
  return { kind: "visit" };
}

/** The attachments of a visit: photos made with the tablet's camera, X-rays and files. */
export function AttachmentsPanel({ visitId, species, selectedTeeth = [], tooth, locked }: AttachmentsPanelProps) {
  const t = useTranslations("attachments");
  const { db, organizationId, canWrite, visitRights, status, syncNow, syncSoon } = useRequiredOffline();
  const all = useLiveQuery(() => (db ? listAttachmentsOfVisit(db, visitId) : undefined), [db, visitId]);
  const [kind, setKind] = useState<AttachmentKind>("xray");
  const [target, setTarget] = useState<string>("visit");
  const [error, setError] = useState<FileError | "finalVisit" | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  // What the camera input is for when it returns a photo: its kind, and whether it is a quick before/after shot.
  const pendingKind = useRef<AttachmentKind>("before");
  const pendingQuick = useRef(false);

  const canAdd = visitRights.attach && canWrite && !locked;
  const items = (all ?? []).filter((item) => (tooth === undefined ? true : item.tooth === tooth));

  /** Where a new attachment goes: the fixed tooth; else the chosen target; a quick photo goes to the one selected tooth. */
  function targetFor(quick: boolean): Target {
    if (tooth !== undefined) return { kind: "tooth", tooth };
    if (quick) return selectedTeeth.length === 1 ? { kind: "tooth", tooth: selectedTeeth[0] } : parseTarget(target);
    return parseTarget(target);
  }

  async function addFiles(files: FileList | null, chosenKind: AttachmentKind, quick: boolean) {
    if (!db || !files) return;
    setError(null);
    const where = targetFor(quick);
    for (const file of Array.from(files)) {
      const result = await addAttachment(db, organizationId, {
        visitId,
        tooth: where.kind === "tooth" ? where.tooth : null,
        quadrant: where.kind === "quadrant" ? where.quadrant : null,
        kind: chosenKind,
        file,
      });
      if (!result.ok) setError(result.error);
    }
    syncSoon();
  }

  /** A quick before/after photo: the camera opens at once. */
  function quickPhoto(chosenKind: AttachmentKind) {
    pendingKind.current = chosenKind;
    pendingQuick.current = true;
    camera.current?.click();
  }

  const open = viewing ? items.find((item) => item.id === viewing) : undefined;
  const pairs = pairUp(items);
  const pairedIds = new Set(pairs.flatMap((pair) => [pair.before.id, pair.after.id]));
  const rest = items.filter((item) => !pairedIds.has(item.id));
  const refused = (all ?? []).filter((item) => item.uploadProblem !== null);

  return (
    <div className="flex flex-col gap-4">
      {canAdd ? (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`attachment-kind-${visitId}-${tooth ?? "all"}`}>{t("kind")}</Label>
              <select
                id={`attachment-kind-${visitId}-${tooth ?? "all"}`}
                className={selectClass}
                value={kind}
                onChange={(event) => setKind(event.target.value as AttachmentKind)}
              >
                {ATTACHMENT_KINDS.map((value) => (
                  <option key={value} value={value}>
                    {t(`kinds.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            {tooth === undefined ? (
              <div className="flex flex-col gap-1">
                <Label htmlFor={`attachment-target-${visitId}`}>{t("target")}</Label>
                <select id={`attachment-target-${visitId}`} className={selectClass} value={target} onChange={(event) => setTarget(event.target.value)}>
                  <option value="visit">{t("targets.visit")}</option>
                  {[1, 2, 3, 4].map((quadrant) => (
                    <option key={quadrant} value={`q${quadrant}`}>
                      {t("targets.quadrant", { number: quadrant })}
                    </option>
                  ))}
                  {getTeeth(species).map((entry) => (
                    <option key={entry.number} value={`t${entry.number}`}>
                      {t("targets.tooth", { number: entry.number })}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                pendingKind.current = kind;
                pendingQuick.current = false;
                camera.current?.click();
              }}
            >
              {t("takePhoto")}
            </Button>
            <Button type="button" variant="outline" onClick={() => picker.current?.click()}>
              {t("chooseFile")}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("quickTitle")}>
            <Button type="button" onClick={() => quickPhoto("before")}>
              {t("quickBefore")}
            </Button>
            <Button type="button" onClick={() => quickPhoto("after")}>
              {t("quickAfter")}
            </Button>
            <p className="self-center text-sm text-muted-foreground">
              {tooth !== undefined || selectedTeeth.length === 1 ? t("quickToTooth", { number: tooth ?? selectedTeeth[0] }) : t("quickToTarget")}
            </p>
          </div>
          {/* The camera input opens the tablet's camera directly; the picker takes images, X-rays and PDFs from the device. */}
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            data-testid="attachment-camera"
            onChange={(event) => {
              void addFiles(event.target.files, pendingKind.current, pendingQuick.current);
              event.target.value = "";
            }}
          />
          <input
            ref={picker}
            type="file"
            accept={ALLOWED_TYPES.join(",")}
            multiple
            hidden
            data-testid="attachment-picker"
            onChange={(event) => {
              void addFiles(event.target.files, kind, false);
              event.target.value = "";
            }}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {t(`fileErrors.${error}`)}
            </p>
          ) : null}
        </div>
      ) : null}

      {status.pendingFiles > 0 ? (
        <p role="status" className="text-sm text-muted-foreground">
          {status.online ? t("uploading", { count: status.pendingFiles }) : t("waitingForConnection", { count: status.pendingFiles })}
        </p>
      ) : null}
      {refused.length > 0 && db ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p>{refused.some((item) => item.uploadProblem === "quota") ? t("quotaFull") : t("denied")}</p>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await retryRefusedFiles(db);
              void syncNow();
            }}
          >
            {t("retry")}
          </Button>
        </div>
      ) : null}

      {all && items.length === 0 ? <p className="text-muted-foreground">{t("none")}</p> : null}

      {pairs.length > 0 ? (
        <section aria-label={t("pairsTitle")} className="flex flex-col gap-3">
          <h3 className="font-semibold">{t("pairsTitle")}</h3>
          {pairs.map((pair) => (
            <div key={`${pair.before.id}-${pair.after.id}`} className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-3">
              <Thumb item={pair.before} onOpen={() => setViewing(pair.before.id)} caption={t("kinds.before")} />
              <Thumb item={pair.after} onOpen={() => setViewing(pair.after.id)} caption={t("kinds.after")} />
              <p className="col-span-2 text-sm text-muted-foreground">{describeTarget(pair.before, t)}</p>
            </div>
          ))}
        </section>
      ) : null}

      {rest.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rest.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 rounded-xl border bg-card p-2">
              <Thumb item={item} onOpen={() => setViewing(item.id)} caption={t(`kinds.${item.kind}`)} />
              <p className="text-sm text-muted-foreground">{describeTarget(item, t)}</p>
              <p className="text-xs text-muted-foreground">{item.uploaded && !item.hasPendingChanges ? t("stored") : t("waiting")}</p>
              {canAdd ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    if (!db || !window.confirm(t("deleteConfirm"))) return;
                    await removeAttachment(db, item.id);
                    syncSoon();
                  }}
                >
                  {t("delete")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {open ? (
        <Viewer
          item={open}
          canEdit={canAdd}
          species={species}
          onKind={(next) => db && void updateAttachment(db, open.id, { kind: next }).then(syncSoon)}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}

/** Before and after photos of the same place belong together, oldest with oldest. */
function pairUp(items: readonly AttachmentListItem[]): { before: AttachmentListItem; after: AttachmentListItem }[] {
  const groups = new Map<string, { before: AttachmentListItem[]; after: AttachmentListItem[] }>();
  for (const item of items) {
    if (item.kind !== "before" && item.kind !== "after") continue;
    const key = targetValue(targetOf(item));
    const group = groups.get(key) ?? { before: [], after: [] };
    group[item.kind].push(item);
    groups.set(key, group);
  }
  const pairs: { before: AttachmentListItem; after: AttachmentListItem }[] = [];
  for (const group of groups.values()) {
    const count = Math.min(group.before.length, group.after.length);
    for (let index = 0; index < count; index += 1) pairs.push({ before: group.before[index], after: group.after[index] });
  }
  return pairs;
}

function describeTarget(item: AttachmentListItem, t: ReturnType<typeof useTranslations<"attachments">>): string {
  const target = targetOf(item);
  if (target.kind === "tooth") return t("targets.tooth", { number: target.tooth });
  if (target.kind === "quadrant") return t("targets.quadrant", { number: target.quadrant });
  return t("targets.visit");
}

function Thumb({ item, onOpen, caption }: { item: AttachmentListItem; onOpen: () => void; caption: string }) {
  const t = useTranslations("attachments");
  const source = useSource(item, false);
  const pdf = item.type === "application/pdf";

  return (
    <button type="button" onClick={onOpen} className="flex min-h-touch flex-col gap-1 text-left" aria-label={`${caption}${item.originalName ? `: ${item.originalName}` : ""}`}>
      <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border bg-muted">
        {source && !pdf ? (
          // eslint-disable-next-line @next/next/no-img-element -- a picture from this device or a short-lived signed link, not a site asset
          <img src={source} alt="" className="size-full object-cover" />
        ) : (
          <span className="text-lg font-semibold text-muted-foreground">{pdf ? "PDF" : t("noPreview")}</span>
        )}
      </span>
      <span className="text-sm font-medium">{caption}</span>
    </button>
  );
}

interface ViewerProps {
  item: AttachmentListItem;
  canEdit: boolean;
  species: Species;
  onKind: (kind: AttachmentKind) => void;
  onClose: () => void;
}

/** Full screen view with zoom; a PDF opens in a new tab. */
function Viewer({ item, canEdit, onKind, onClose }: ViewerProps) {
  const t = useTranslations("attachments");
  const dialog = useRef<HTMLDialogElement>(null);
  const source = useSource(item, true);
  const [zoom, setZoom] = useState(1);
  const pdf = item.type === "application/pdf";

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-label={item.originalName ?? t(`kinds.${item.kind}`)}
      className="m-0 h-dvh max-h-none w-dvw max-w-none bg-background p-3 text-foreground backdrop:bg-black/60"
    >
      <div className="flex h-full flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => dialog.current?.close()}>
            {t("close")}
          </Button>
          {!pdf ? (
            <>
              <Button type="button" variant="outline" aria-label={t("zoomOut")} onClick={() => setZoom((z) => Math.max(0.5, z - 0.5))}>
                −
              </Button>
              <Button type="button" variant="outline" aria-label={t("zoomReset")} onClick={() => setZoom(1)}>
                {Math.round(zoom * 100)}%
              </Button>
              <Button type="button" variant="outline" aria-label={t("zoomIn")} onClick={() => setZoom((z) => Math.min(6, z + 0.5))}>
                +
              </Button>
            </>
          ) : source ? (
            <a href={source} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
              {t("openPdf")}
            </a>
          ) : null}
          {canEdit ? (
            <select
              aria-label={t("kind")}
              className={selectClass}
              value={item.kind}
              onChange={(event) => onKind(event.target.value as AttachmentKind)}
            >
              {ATTACHMENT_KINDS.map((value) => (
                <option key={value} value={value}>
                  {t(`kinds.${value}`)}
                </option>
              ))}
            </select>
          ) : null}
          <span className="text-sm text-muted-foreground">{item.originalName}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted">
          {source && !pdf ? (
            // eslint-disable-next-line @next/next/no-img-element -- see above
            <img src={source} alt={item.originalName ?? ""} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} className="mx-auto block" />
          ) : (
            <p className="p-6 text-muted-foreground">{pdf ? t("pdfHint") : t("notAvailable")}</p>
          )}
        </div>
      </div>
    </dialog>
  );
}
