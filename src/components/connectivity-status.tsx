"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
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
 * Always-visible connection indicator. For now it reflects the browser's
 * network state; the offline layer will extend it with the number of changes
 * waiting to be synchronised and the time of the last successful sync.
 */
export function ConnectivityStatus() {
  const t = useTranslations("connectivity");
  const isOnline = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <span
      role="status"
      title={isOnline ? t("onlineHint") : t("offlineHint")}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium",
        isOnline ? "bg-card text-muted-foreground" : "border-warning bg-warning-soft text-warning",
      )}
    >
      <span aria-hidden="true" className={cn("size-2.5 rounded-full", isOnline ? "bg-tooth-healthy" : "bg-warning")} />
      {isOnline ? t("online") : t("offline")}
    </span>
  );
}
