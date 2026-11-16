"use client";

import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useRequiredOffline } from "@/components/offline/offline-provider";
import { Button } from "@/components/ui/button";
import { todayText } from "@/lib/offline/visit-form";
import { createVisit, listVisitsOfPatient, updateVisit } from "@/lib/offline/visits-store";
import { visitPath } from "@/lib/routes";

/** The visits of one patient, newest first, with a button to start a new treatment record. */
export function PatientVisits({ patientId }: { patientId: string }) {
  const t = useTranslations("visits");
  const format = useFormatter();
  const router = useRouter();
  const { db, organizationId, canWrite, visitRights, userName, syncSoon } = useRequiredOffline();
  const visits = useLiveQuery(() => (db ? listVisitsOfPatient(db, patientId) : undefined), [db, patientId]);

  return (
    <section aria-labelledby="patient-visits" className="flex max-w-2xl flex-col gap-3 border-t pt-6">
      <h2 id="patient-visits" className="text-xl font-semibold">
        {t("patientVisits")}
      </h2>
      {visits && visits.length === 0 ? (
        <p className="text-muted-foreground">{t("noVisits")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visits?.map((visit) => (
            <li key={visit.id}>
              <Link
                href={visitPath(visit.id)}
                className="flex min-h-touch flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border bg-card px-4 py-2 hover:bg-accent/40"
              >
                <span className="font-semibold">
                  {format.dateTime(new Date(`${visit.visitDate}T12:00:00`), { dateStyle: "long" })}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {visit.veterinarianName ?? t("withoutVet")}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-sm">
                  {visit.readyToFinalize && visit.status === "draft" ? (
                    <span className="rounded-full bg-accent px-3 py-1 font-medium">{t("readyBadge")}</span>
                  ) : null}
                  <span className="rounded-full border px-3 py-1 font-medium">{t(`status.${visit.status}`)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {canWrite && visitRights.write ? (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              if (!db) return;
              const id = await createVisit(db, organizationId, patientId, todayText());
              // A vet starting a record is most likely the treating vet.
              if (visitRights.finalize && userName) await updateVisit(db, id, { veterinarianName: userName });
              syncSoon();
              router.push(visitPath(id));
            }}
          >
            {t("newVisit")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
