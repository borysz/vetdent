"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** Shown when something on the server failed while building a page, e.g. the auth server was unreachable. */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("errorPage");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-lg text-muted-foreground">{t("body")}</p>
      <Button type="button" onClick={() => reset()}>
        {t("retry")}
      </Button>
    </main>
  );
}
