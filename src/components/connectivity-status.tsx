"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { useOffline } from "@/components/offline/offline-provider";
import { cn } from "@/lib/utils";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const getSnapshot = (): boolean => navigator.onLine;
// On the server (and during hydration) we assume a connection.
const getServerSnapshot = (): boolean => true;

/**
 * Always-visible connection indicator. Inside the signed-in area it also
 * shows how many changes are waiting to be sent and when the last
 * synchronisation finished, and lets the user start one.
 */
export function ConnectivityStatus() {
  const t = useTranslations("connectivity");
  const format = useFormatter();
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const offline = useOffline();
  const status = offline?.status;

  const label = !isOnline
    ? t("offline")
    : status?.syncing
      ? t("syncing")
      : status && status.pending > 0
        ? t("pending", { count: status.pending })
        : status?.error
          ? t(`errors.${status.error}`)
          : status
            ? t("synced")
            : t("online");

  const attention = !isOnline || Boolean(status && (status.problems > 0 || status.error));
  const detail = [
    !isOnline ? t("savedOnDevice") : null,
    status && status.problems > 0 ? t("problems", { count: status.problems }) : null,
    status
      ? status.lastSyncAt
        ? t("lastSync", { time: format.dateTime(new Date(status.lastSyncAt), { timeStyle: "short" }) })
        : t("neverSynced")
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        role="status"
        title={detail || (isOnline ? t("onlineHint") : t("offlineHint"))}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium",
          attention ? "border-warning bg-warning-soft text-warning" : "bg-card text-muted-foreground",
        )}
      >
        <span
          aria-hidden="true"
          className={cn("size-2.5 rounded-full", attention ? "bg-warning" : "bg-tooth-healthy", status?.syncing && "animate-pulse")}
        />
        {label}
      </span>
      {offline && isOnline ? (
        <button
          type="button"
          onClick={() => void offline.syncNow()}
          disabled={status?.syncing}
          className="h-9 rounded-full px-3 text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
        >
          {t("syncNow")}
        </button>
      ) : null}
    </div>
  );
}
