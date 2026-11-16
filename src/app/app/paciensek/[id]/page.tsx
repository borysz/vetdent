import type { Metadata } from "next";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { PatientEditor } from "@/components/patients/patient-editor";
import { PatientVisits } from "@/components/visits/patient-visits";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("patients");
  return { title: t("editTitle") };
}

export default function EditPatientPage({ params }: PageProps<"/app/paciensek/[id]">) {
  const t = useTranslations("patients");

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">{t("editTitle")}</h1>
      {/* The id comes from the URL, which is only known at request time. */}
      <Suspense fallback={null}>
        <Editor params={params} />
      </Suspense>
    </>
  );
}

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <PatientEditor id={id} />
      <PatientVisits patientId={id} />
    </>
  );
}
