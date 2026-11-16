"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DeviceLock } from "@/components/offline/device-lock";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { databaseName, LocalDatabase, META_KEYS, readMeta } from "@/lib/offline/local-db";
import { createSupabaseSyncApi } from "@/lib/offline/supabase-sync-api";
import { countPending, syncAll, type SyncErrorKind } from "@/lib/offline/sync-engine";

export interface OfflineStatus {
  online: boolean;
  syncing: boolean;
  /** Records with changes waiting to be sent. */
  pending: number;
  /** Records the server refused. */
  problems: number;
  /** When the last round finished successfully (ms since epoch), if ever. */
  lastSyncAt: number | null;
  /** Why the last round failed; `null` after a success. */
  error: SyncErrorKind | null;
}

export interface OfflineContextValue {
  /** `null` on the server and for the very first client render. */
  db: LocalDatabase | null;
  organizationId: string;
  /** The subscription allows changes (not read-only mode). */
  canWrite: boolean;
  canDelete: boolean;
  status: OfflineStatus;
  syncNow: () => Promise<void>;
  /** Sync shortly, e.g. after a local edit; several calls in a row make one round. */
  syncSoon: () => void;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

/** The offline layer, or `null` outside the signed-in area. */
export function useOffline(): OfflineContextValue | null {
  return useContext(OfflineContext);
}

export function useRequiredOffline(): OfflineContextValue {
  const value = useContext(OfflineContext);
  if (!value) throw new Error("useRequiredOffline must be used inside <OfflineProvider>");
  return value;
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

const AUTO_SYNC_MS = 30_000;
const SYNC_SOON_MS = 800;

interface OfflineProviderProps {
  userId: string;
  organizationId: string;
  canWrite: boolean;
  canDelete: boolean;
  children: React.ReactNode;
}

export function OfflineProvider({ userId, organizationId, canWrite, canDelete, children }: OfflineProviderProps) {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  // One database per user and organization, opened in the browser only.
  const db = useMemo(
    () => (typeof window === "undefined" ? null : new LocalDatabase(databaseName(userId, organizationId))),
    [userId, organizationId],
  );
  // The connection is deliberately never closed here. React's development mode runs effects twice
  // (mount, cleanup, mount); closing the database in that cleanup aborted the first live queries,
  // which then never produced a result – lists stayed on "loading" after a full page load. The
  // browser closes the connection when the page goes away, and Dexie hands the old connection over
  // by itself if a newer database version is ever needed.

  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<SyncErrorKind | null>(null);
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const counts = useLiveQuery(() => (db ? countPending(db) : undefined), [db]);
  const lastSyncAt = useLiveQuery(async () => {
    if (!db) return undefined;
    const value = await readMeta(db, META_KEYS.lastSyncAt);
    return typeof value === "number" ? value : null;
  }, [db]);

  const syncNow = useCallback(async () => {
    if (!db || running.current || !navigator.onLine) return;
    running.current = true;
    setSyncing(true);
    try {
      const api = createSupabaseSyncApi(createSupabaseBrowserClient(), organizationId);
      const outcome = await syncAll(db, organizationId, api);
      setError(outcome.error?.kind ?? null);
    } finally {
      running.current = false;
      setSyncing(false);
    }
  }, [db, organizationId]);

  const syncSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void syncNow(), SYNC_SOON_MS);
  }, [syncNow]);

  // Sync on start, when the connection comes back, and every half minute while online.
  useEffect(() => {
    if (!db) return;
    if (online) void syncNow();
    const interval = setInterval(() => void syncNow(), AUTO_SYNC_MS);
    return () => {
      clearInterval(interval);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [db, online, syncNow]);

  const value = useMemo<OfflineContextValue>(
    () => ({
      db,
      organizationId,
      canWrite,
      canDelete,
      status: {
        online,
        syncing,
        pending: counts?.pending ?? 0,
        problems: counts?.problems ?? 0,
        lastSyncAt: lastSyncAt ?? null,
        error,
      },
      syncNow,
      syncSoon,
    }),
    [db, organizationId, canWrite, canDelete, online, syncing, counts, lastSyncAt, error, syncNow, syncSoon],
  );

  return (
    <OfflineContext value={value}>
      <DeviceLock
        db={db}
        userId={userId}
        organizationId={organizationId}
        online={online}
        lastSyncAt={value.status.lastSyncAt}
        syncNow={syncNow}
      >
        {children}
      </DeviceLock>
    </OfflineContext>
  );
}
