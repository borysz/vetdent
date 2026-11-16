"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRequiredOffline } from "@/components/offline/offline-provider";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listClients } from "@/lib/offline/clients-store";
import { clientPath, routes } from "@/lib/routes";

/** The clients on this device, searchable, working without a connection. */
export function ClientList() {
  const t = useTranslations("clients");
  const { db, organizationId, canWrite } = useRequiredOffline();
  const [query, setQuery] = useState("");

  const clients = useLiveQuery(() => (db ? listClients(db, organizationId, query) : undefined), [db, organizationId, query]);
  const total = useLiveQuery(async () => (db ? await db.clients.where("organizationId").equals(organizationId).count() : undefined), [db, organizationId]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="client-search" className="sr-only">
          {t("search")}
        </label>
        <Input
          id="client-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search")}
          autoComplete="off"
          className="max-w-xl flex-1"
        />
        {canWrite ? (
          <Link href={routes.newClient} className={buttonVariants()}>
            {t("new")}
          </Link>
        ) : null}
      </div>

      {clients === undefined ? (
        <p className="text-muted-foreground">{t("loading")}</p>
      ) : clients.length === 0 ? (
        <section className="rounded-2xl border border-dashed bg-card p-8 text-center">
          {total === 0 ? (
            <>
              <h2 className="text-lg font-semibold">{t("emptyTitle")}</h2>
              <p className="mx-auto mt-1 max-w-xl text-muted-foreground">{t("emptyBody")}</p>
            </>
          ) : (
            <p className="text-muted-foreground">{t("noResults")}</p>
          )}
        </section>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("count", { count: clients.length })}</p>
          <ul className="flex flex-col gap-2">
            {clients.map((client) => (
              <li key={client.id}>
                <Link
                  href={clientPath(client.id)}
                  className="flex min-h-touch flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border bg-card px-4 py-3 hover:bg-accent/40"
                >
                  <span>
                    <span className="block font-semibold">{client.fullName}</span>
                    <span className="block text-sm text-muted-foreground">
                      {[client.phone, client.email].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="flex gap-2 text-sm font-medium">
                    {client.problem ? (
                      <span className="rounded-full bg-warning-soft px-3 py-0.5 text-warning">{t("problem")}</span>
                    ) : client.hasPendingChanges ? (
                      <span className="rounded-full bg-accent px-3 py-0.5 text-accent-foreground">{t("unsent")}</span>
                    ) : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
