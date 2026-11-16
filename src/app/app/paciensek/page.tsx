import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { PatientList } from "@/components/patients/patient-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("patients");
  return { title: t("title") };
}

export default function PatientsPage() {
  const t = useTranslations("patients");

  return (
    <>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-1 max-w-3xl text-lg text-muted-foreground">{t("lead")}</p>
      </div>
      <PatientList />
    </>
  );
}
