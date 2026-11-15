import Link from "next/link";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/routes";

export default function NotFound() {
  const t = useTranslations("notFound");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-start justify-center gap-4 px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-lg text-muted-foreground">{t("body")}</p>
      <Link href={routes.home} className={buttonVariants()}>
        {t("home")}
      </Link>
    </main>
  );
}
