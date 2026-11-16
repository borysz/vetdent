"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRequiredOffline } from "@/components/offline/offline-provider";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listPatients } from "@/lib/offline/patients-store";
import { patientPath, routes } from "@/lib/routes";

/** The patients on this device, searchable, working without a connection. */
export function PatientList() {
  const t = useTranslations("patients");
  const { db, organizationId, canWrite } = useRequiredOffline();
  const [query, setQuery] = useState("");

  const patients = useLiveQuery(
    () => (db ? listPatients(db, organizationId, { query }) : undefined),
    [db, organizationId, query],
  );
  const counts = useLiveQuery(
    async () =>
      db
        ? {
            patients: await db.patients.where("organizationId").equals(organizationId).count(),
            clients: await db.clients.where("organizationId").equals(organizationId).count(),
          }
        : undefined,
    [db, organizationId],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="patient-search" className="sr-only">
          {t("search")}
        </label>
        <Input
          id="patient-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search")}
          autoComplete="off"
          className="max-w-xl flex-1"
        />
        {canWrite && counts && counts.clients > 0 ? (
          <Link href={routes.newPatient} className={buttonVariants()}>
            {t("new")}
          </Link>
        ) : null}
      </div>

      {canWrite && counts && counts.clients === 0 ? (
        <p className="text-muted-foreground">
          {t("noClients")}{" "}
          <Link href={routes.clients} className="font-medium text-primary underline-offset-4 hover:underline">
            {t("toClients")}
          </Link>
        </p>
      ) : null}

      {patients === undefined ? (
        <p className="text-muted-foreground">{t("loading")}</p>
      ) : patients.length === 0 ? (
        <section className="rounded-2xl border border-dashed bg-card p-8 text-center">
          {counts?.patients === 0 ? (
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
          <p className="text-sm text-muted-foreground">{t("count", { count: patients.length })}</p>
          <ul className="flex flex-col gap-2">
            {patients.map((patient) => (
              <li key={patient.id}>
                <Link
                  href={patientPath(patient.id)}
                  className="flex min-h-touch flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border bg-card px-4 py-3 hover:bg-accent/40"
                >
                  <span>
                    <span className="block font-semibold">
                      {patient.name}{" "}
                      <span className="font-normal text-muted-foreground">
                        · {t(`species.${patient.species}`)}
                        {patient.breed ? `, ${patient.breed}` : ""}
                      </span>
                    </span>
                    <span className="block text-sm text-muted-foreground">
                      {t("ownerLabel", { owner: patient.ownerName || t("ownerUnknown") })}
                    </span>
                  </span>
                  <span className="flex gap-2 text-sm font-medium">
                    {patient.problem ? (
                      <span className="rounded-full bg-warning-soft px-3 py-0.5 text-warning">{t("problem")}</span>
                    ) : patient.hasPendingChanges ? (
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
