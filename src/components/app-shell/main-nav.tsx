"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  /** Highlight only on an exact match (used for the dashboard, the parent of every other page). */
  exact?: boolean;
}

/** Primary navigation of the signed-in area; highlights the current section. */
export function MainNav({ label, items }: { label: string; items: readonly NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="border-b bg-card">
      <ul className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
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
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
