"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";
import { hasPin, readAttempts, tryUnlock } from "@/lib/offline/device-security";
import { databaseName, type LocalDatabase } from "@/lib/offline/local-db";
import {
  IDLE_LOCK_MS,
  MAX_FAILURES,
  MAX_OFFLINE_DAYS,
  FREE_ATTEMPTS,
  idleExpired,
  offlineTooLong,
  shouldWipe,
  waitMs,
} from "@/lib/offline/pin";
import { wipeDatabase } from "@/lib/offline/local-db";

interface DeviceLockProps {
  db: LocalDatabase | null;
  userId: string;
  organizationId: string;
  online: boolean;
  lastSyncAt: number | null;
  syncNow: () => Promise<void>;
  children: React.ReactNode;
}

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "scroll"] as const;

/**
 * Covers the app when the device has been idle (if a PIN is set) or has been
 * away from the server for too long. The content stays mounted underneath –
 * unsent work is not lost – but hidden and unreachable.
 */
export function DeviceLock({ db, userId, organizationId, online, lastSyncAt, syncNow, children }: DeviceLockProps) {
  const t = useTranslations("deviceLock");
  const pinSet = useLiveQuery(async () => (db ? await hasPin(db) : undefined), [db]);
  const attempts = useLiveQuery(async () => (db ? await readAttempts(db) : undefined), [db]);

  const lastActivity = useRef(0);
  const [idleLocked, setIdleLocked] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Track activity, and check the clock every second.
  useEffect(() => {
    lastActivity.current = Date.now();
    const touch = () => {
      lastActivity.current = Date.now();
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, touch, { passive: true, capture: true });

    const interval = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (idleExpired(lastActivity.current, current, IDLE_LOCK_MS)) setIdleLocked(true);
    }, 1_000);

    return () => {
      clearInterval(interval);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, touch, { capture: true });
    };
  }, []);

  const stale = offlineTooLong(lastSyncAt, now, MAX_OFFLINE_DAYS);
  const locked = (idleLocked && pinSet === true) || stale;

  return (
    <>
      <div inert={locked} aria-hidden={locked} className={locked ? "invisible" : undefined}>
        {children}
      </div>
      {locked ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="device-lock-title"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border bg-card p-6">
            {stale ? (
              <StaleNotice
                days={MAX_OFFLINE_DAYS}
                online={online}
                syncNow={syncNow}
                title={t("staleTitle")}
                body={t("staleBody", { days: MAX_OFFLINE_DAYS })}
              />
            ) : db ? (
              <PinPrompt
                db={db}
                userId={userId}
                organizationId={organizationId}
                waitMillis={attempts ? waitMs(attempts, now) : 0}
                failures={attempts?.failures ?? 0}
                onUnlocked={() => {
                  lastActivity.current = Date.now();
                  setIdleLocked(false);
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function StaleNotice({
  online,
  syncNow,
  title,
  body,
}: {
  days: number;
  online: boolean;
  syncNow: () => Promise<void>;
  title: string;
  body: string;
}) {
  const t = useTranslations("deviceLock");
  const [checking, setChecking] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <h2 id="device-lock-title" className="text-xl font-semibold">
        {title}
      </h2>
      <p>{body}</p>
      <Button
        type="button"
        disabled={!online || checking}
        onClick={async () => {
          setChecking(true);
          try {
            await syncNow();
          } finally {
            setChecking(false);
          }
        }}
      >
        {checking ? t("staleChecking") : t("staleRetry")}
      </Button>
    </div>
  );
}

function PinPrompt({
  db,
  userId,
  organizationId,
  waitMillis,
  failures,
  onUnlocked,
}: {
  db: LocalDatabase;
  userId: string;
  organizationId: string;
  waitMillis: number;
  failures: number;
  onUnlocked: () => void;
}) {
  const t = useTranslations("deviceLock");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wiping, startWipe] = useTransition();

  const waitSeconds = Math.ceil(waitMillis / 1000);

  if (wiping) {
    return <p role="status">{t("wiping")}</p>;
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const pin = String(new FormData(form).get("pin") ?? "");
        setBusy(true);
        try {
          const result = await tryUnlock(db, pin, Date.now());
          if (result.ok) {
            form.reset();
            setMessage(null);
            onUnlocked();
            return;
          }
          form.reset();
          if (result.reason === "wrong") {
            if (shouldWipe(result.attempts)) {
              // Too many wrong guesses: nothing readable stays on this device.
              startWipe(async () => {
                await wipeDatabase(databaseName(userId, organizationId));
                await signOutAction();
              });
              return;
            }
            setMessage(
              result.attempts.failures < FREE_ATTEMPTS
                ? t("wrongLeft", { count: FREE_ATTEMPTS - result.attempts.failures })
                : t("wrong"),
            );
          }
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 id="device-lock-title" className="text-xl font-semibold">
        {t("title")}
      </h2>
      <p>{t("lead")}</p>
      <FormField
        label={t("pin")}
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]*"
        maxLength={8}
        required
        autoFocus
        disabled={waitMillis > 0}
        className="text-center font-mono text-xl tracking-[0.4em]"
      />
      {waitMillis > 0 ? (
        <p role="alert" className="text-sm text-destructive">
          {t("waiting", { seconds: waitSeconds })}
        </p>
      ) : message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      {failures >= FREE_ATTEMPTS ? (
        <p className="text-sm text-muted-foreground">
          {t("wipeWarning")} ({failures}/{MAX_FAILURES})
        </p>
      ) : null}
      <Button type="submit" disabled={busy || waitMillis > 0}>
        {t("unlock")}
      </Button>
    </form>
  );
}
