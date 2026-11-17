import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth/dal";
import { conflictFieldKey, formatConflictValue } from "@/lib/conflicts/conflicts";
import { loadOpenConflicts, MAX_SHOWN_CONFLICTS } from "@/lib/conflicts/load";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveConflictAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("conflicts");
  return { title: t("title") };
}

export default function ConflictsPage() {
  const t = useTranslations();

  return (
    <>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("conflicts.title")}</h1>
        <p className="mt-1 max-w-3xl text-lg text-muted-foreground">{t("conflicts.lead")}</p>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">{t("common.loading")}</p>}>
        <Conflicts />
      </Suspense>
    </>
  );
}

async function Conflicts() {
  const { membership } = await requirePermission("clients.write");
  const t = await getTranslations();
  const format = await getFormatter();
  const translate = (key: string, values?: Record<string, string | number>) => t(key as never, values as never);
  const conflicts = await loadOpenConflicts(await createSupabaseServerClient(), membership.organization.id);

  if (conflicts.length === 0) return <p className="text-muted-foreground">{t("conflicts.none")}</p>;

  return (
    <>
      <ul className="flex max-w-4xl flex-col gap-4">
        {conflicts.map((conflict) => {
          const fieldKey = conflictFieldKey(conflict.table, conflict.field);
          const record = [conflict.title, conflict.detail].filter(Boolean).join(" · ");
          return (
            <li key={conflict.id} className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
              <div>
                <p className="text-sm text-muted-foreground">{t(`conflicts.tables.${conflict.table}`)}</p>
                <p className="text-lg font-semibold">{record || t("conflicts.unknownRecord")}</p>
                <p className="font-medium">{t.has(fieldKey as never) ? translate(fieldKey) : conflict.field}</p>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-accent p-3">
                  <dt className="text-sm font-medium text-muted-foreground">{t("conflicts.kept")}</dt>
                  <dd className="mt-1 break-words">{formatConflictValue(conflict.field, conflict.kept, translate)}</dd>
                </div>
                <div className="rounded-xl border p-3">
                  <dt className="text-sm font-medium text-muted-foreground">{t("conflicts.lost")}</dt>
                  <dd className="mt-1 break-words">{formatConflictValue(conflict.field, conflict.lost, translate)}</dd>
                </div>
              </dl>
              <p className="text-sm text-muted-foreground">
                {t("conflicts.by", { name: conflict.byName ?? t("conflicts.unknownPerson") })} ·{" "}
                {format.dateTime(new Date(conflict.createdAt), { dateStyle: "medium", timeStyle: "short" })}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {conflict.href ? (
                  <Link
                    href={conflict.href}
                    className="inline-flex min-h-touch items-center justify-center rounded-lg border border-input bg-card px-4 font-medium hover:bg-accent"
                  >
                    {t("conflicts.open")}
                  </Link>
                ) : null}
                <form action={resolveConflictAction}>
                  <input type="hidden" name="id" value={conflict.id} />
                  <Button type="submit">{t("conflicts.resolve")}</Button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>
      {conflicts.length >= MAX_SHOWN_CONFLICTS ? null : (
        <p className="text-sm text-muted-foreground">{t("conflicts.showing", { count: conflicts.length })}</p>
      )}
    </>
  );
}
