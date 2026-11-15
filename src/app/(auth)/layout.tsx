import Link from "next/link";
import { useTranslations } from "next-intl";
import { routes } from "@/lib/routes";

/** Centred, narrow layout shared by the sign-in, sign-up and password pages. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("app");

  return (
    <div className="flex flex-1 flex-col items-center px-4 py-8 sm:px-6 sm:py-14">
      <Link href={routes.home} className="mb-8 text-2xl font-semibold tracking-tight text-primary">
        {t("name")}
      </Link>
      <main className="w-full max-w-md">{children}</main>
    </div>
  );
}
