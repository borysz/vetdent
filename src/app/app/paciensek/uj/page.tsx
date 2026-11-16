import type { Metadata } from "next";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { PatientEditor } from "@/components/patients/patient-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("patients");
  return { title: t("newTitle") };
}

export default function NewPatientPage() {
  const t = useTranslations("patients");

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">{t("newTitle")}</h1>
      {/* The form reads the URL (?gazdi=), which is only known at request time. */}
      <Suspense fallback={null}>
        <PatientEditor />
      </Suspense>
    </>
  );
}
