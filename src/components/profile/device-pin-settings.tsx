"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormField } from "@/components/forms/form-field";
import { useOffline } from "@/components/offline/offline-provider";
import { Button } from "@/components/ui/button";
import { clearPin, hasPin, setPin } from "@/lib/offline/device-security";
import { IDLE_LOCK_MS, PIN_PATTERN } from "@/lib/offline/pin";

/** Sets, changes or removes the PIN of this device. */
export function DevicePinSettings() {
  const t = useTranslations("devicePin");
  const offline = useOffline();
  const db = offline?.db ?? null;
  const pinSet = useLiveQuery(async () => (db ? await hasPin(db) : undefined), [db]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!db || pinSet === undefined) return null;

  return (
    <div className="flex flex-col gap-4">
      <p>{pinSet ? t("onBody") : t("offBody", { minutes: IDLE_LOCK_MS / 60_000 })}</p>

      <form
        className="grid max-w-md gap-4"
        noValidate
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          const pin = String(data.get("pin") ?? "");
          const again = String(data.get("again") ?? "");

          setNotice(null);
          if (!PIN_PATTERN.test(pin)) return setError(t("invalid"));
          if (pin !== again) return setError(t("mismatch"));

          setError(null);
          await setPin(db, pin);
          form.reset();
          setNotice(t("saved"));
        }}
      >
        <FormField
          label={t("newPin")}
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
        />
        <FormField
          label={t("confirmPin")}
          name="again"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          error={error ?? undefined}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit">{pinSet ? t("change") : t("set")}</Button>
          {pinSet ? (
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (!window.confirm(t("removeConfirm"))) return;
                await clearPin(db);
                setError(null);
                setNotice(t("removed"));
              }}
            >
              {t("remove")}
            </Button>
          ) : null}
          {notice ? (
            <p role="status" className="text-sm text-success">
              {notice}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
