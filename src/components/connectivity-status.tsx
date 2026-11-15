"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

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
      className={[
        "inline-flex min-h-touch items-center gap-2 rounded-full border px-4 text-sm font-medium",
        isOnline
          ? "border-line bg-panel text-ink-muted"
          : "border-warning bg-warning-soft text-warning",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={["size-2.5 rounded-full", isOnline ? "bg-tooth-healthy" : "bg-warning"].join(" ")}
      />
      {isOnline ? t("online") : t("offline")}
    </span>
  );
}
