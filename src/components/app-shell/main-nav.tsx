"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

const ITEMS = [
  { key: "dashboard", href: routes.app },
  { key: "members", href: routes.members },
  { key: "organization", href: routes.organization },
  { key: "profile", href: routes.profile },
] as const;

/** Primary navigation of the signed-in area; highlights the current section. */
export function MainNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav aria-label={t("label")} className="border-b bg-card">
      <ul className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
        {ITEMS.map((item) => {
          const active = item.href === routes.app ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-touch items-center border-b-2 px-3 font-medium whitespace-nowrap",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
