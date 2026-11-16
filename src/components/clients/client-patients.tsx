"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRequiredOffline } from "@/components/offline/offline-provider";
import { buttonVariants } from "@/components/ui/button";
import { listPatients } from "@/lib/offline/patients-store";
import { newPatientPath, patientPath } from "@/lib/routes";

/** The animals of one client, with a shortcut to add another. */
export function ClientPatients({ clientId }: { clientId: string }) {
  const t = useTranslations("patients");
  const { db, organizationId, canWrite } = useRequiredOffline();
  const patients = useLiveQuery(
    () => (db ? listPatients(db, organizationId, { clientId }) : undefined),
    [db, organizationId, clientId],
  );

  return (
    <section aria-labelledby="client-patients" className="flex max-w-2xl flex-col gap-3 border-t pt-6">
      <h2 id="client-patients" className="text-xl font-semibold">
        {t("patientsOfClient")}
      </h2>
      {patients && patients.length === 0 ? (
        <p className="text-muted-foreground">{t("noPatientsOfClient")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {patients?.map((patient) => (
            <li key={patient.id}>
              <Link
                href={patientPath(patient.id)}
                className="flex min-h-touch items-center justify-between gap-4 rounded-xl border bg-card px-4 py-2 hover:bg-accent/40"
              >
                <span className="font-semibold">{patient.name}</span>
                <span className="text-sm text-muted-foreground">
                  {t(`species.${patient.species}`)}
                  {patient.breed ? `, ${patient.breed}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <div>
          <Link href={newPatientPath(clientId)} className={buttonVariants({ variant: "outline" })}>
            {t("addPatientToClient")}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
