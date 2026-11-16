"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRequiredOffline } from "@/components/offline/offline-provider";
import { buttonVariants } from "@/components/ui/button";
import { recentPatients } from "@/lib/offline/patients-store";
import { patientPath, routes } from "@/lib/routes";

/** Counts and the most recently touched patients, read from the device so it works offline. */
export function DashboardOverview() {
  const t = useTranslations("dashboard");
  const tPatients = useTranslations("patients");
  const { db, organizationId, canWrite } = useRequiredOffline();

  const overview = useLiveQuery(async () => {
    if (!db) return undefined;
    const [clients, patients, recent] = await Promise.all([
      db.clients.where("organizationId").equals(organizationId).filter((row) => !row.pendingDelete && !row.server?.deletedAt).count(),
      db.patients.where("organizationId").equals(organizationId).filter((row) => !row.pendingDelete && !row.server?.deletedAt).count(),
      recentPatients(db, organizationId, 5),
    ]);
    return { clients, patients, recent };
  }, [db, organizationId]);

  if (!overview) return <p className="text-muted-foreground">{t("loadingOverview")}</p>;

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid gap-4 sm:grid-cols-2">
        <Link href={routes.clients} className="rounded-2xl border bg-card p-5 hover:bg-accent/40">
          <dt className="text-muted-foreground">{t("clientsCount")}</dt>
          <dd className="text-3xl font-semibold">{overview.clients}</dd>
        </Link>
        <Link href={routes.patients} className="rounded-2xl border bg-card p-5 hover:bg-accent/40">
          <dt className="text-muted-foreground">{t("patientsCount")}</dt>
          <dd className="text-3xl font-semibold">{overview.patients}</dd>
        </Link>
      </dl>

      <section aria-labelledby="recent-patients" className="flex flex-col gap-3">
        <h2 id="recent-patients" className="text-xl font-semibold">
          {t("recentPatients")}
        </h2>
        {overview.recent.length === 0 ? (
          <p className="text-muted-foreground">{t("recentEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {overview.recent.map((patient) => (
              <li key={patient.id}>
                <Link
                  href={patientPath(patient.id)}
                  className="flex min-h-touch flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border bg-card px-4 py-2 hover:bg-accent/40"
                >
                  <span className="font-semibold">
                    {patient.name}{" "}
                    <span className="font-normal text-muted-foreground">· {tPatients(`species.${patient.species}`)}</span>
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {tPatients("ownerLabel", { owner: patient.ownerName || tPatients("ownerUnknown") })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {canWrite ? (
          <div>
            <Link href={routes.newPatient} className={buttonVariants({ variant: "outline" })}>
              {tPatients("new")}
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}
