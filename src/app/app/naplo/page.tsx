import type { Metadata } from "next";
import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { isAuditAction, isAuditedOrganizationField } from "@/lib/audit/actions";
import { requirePermission } from "@/lib/auth/dal";
import { isMemberRole } from "@/lib/auth/roles";
import type { Json } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PAGE_SIZE = 100;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("audit");
  return { title: t("title") };
}

export default function AuditLogPage() {
  const t = useTranslations();

  return (
    <>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t("audit.title")}</h1>
        <p className="mt-1 max-w-3xl text-lg text-muted-foreground">{t("audit.lead")}</p>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">{t("common.loading")}</p>}>
        <AuditLog />
      </Suspense>
    </>
  );
}

function asRecord(value: Json): Record<string, Json | undefined> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function AuditLog() {
  const { membership } = await requirePermission("audit.view");
  const t = await getTranslations();
  const format = await getFormatter();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, actor_name, action, details, created_at")
    .eq("organization_id", membership.organization.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE);
  if (error) throw new Error(`Could not load the audit log: ${error.message}`);

  if (data.length === 0) {
    return <p className="text-muted-foreground">{t("audit.empty")}</p>;
  }

  const roleLabel = (value: Json | undefined): string =>
    typeof value === "string" && isMemberRole(value) ? t(`roles.${value}`) : String(value ?? "");

  /** A short, human-readable line for the details we know how to explain. */
  const describe = (action: string, details: Json): string | null => {
    const record = asRecord(details);
    if (action === "invitation.created" || action === "invitation.revoked") {
      return t("audit.details.invitation", { email: String(record.email ?? ""), role: roleLabel(record.role) });
    }
    if (action === "member.role_changed") {
      return t("audit.details.roleChange", { from: roleLabel(record.from), to: roleLabel(record.to) });
    }
    if (action === "visit.reopened" && typeof record.reason === "string") {
      return t("audit.details.reopenReason", { reason: record.reason });
    }
    if (action === "organization.updated" && Array.isArray(record.fields)) {
      const fields = record.fields.filter(isAuditedOrganizationField).map((field) => t(`audit.fields.${field}`));
      return fields.length > 0 ? t("audit.details.fields", { fields: fields.join(", ") }) : null;
    }
    return null;
  };

  return (
    <>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead>
            <tr className="border-b">
              <th scope="col" className="p-4 font-semibold">
                {t("audit.columns.time")}
              </th>
              <th scope="col" className="p-4 font-semibold">
                {t("audit.columns.actor")}
              </th>
              <th scope="col" className="p-4 font-semibold">
                {t("audit.columns.action")}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((entry) => {
              const detail = describe(entry.action, entry.details);
              return (
                <tr key={entry.id} className="border-b align-top last:border-b-0">
                  <td className="p-4 whitespace-nowrap text-muted-foreground">
                    {format.dateTime(new Date(entry.created_at), { dateStyle: "medium", timeStyle: "short" })}
                  </td>
                  <td className="p-4">{entry.actor_name ?? t("audit.unknownActor")}</td>
                  <td className="p-4">
                    {isAuditAction(entry.action)
                      ? t(`audit.actions.${entry.action}`)
                      : t("audit.unknownAction", { action: entry.action })}
                    {detail ? <span className="block text-sm text-muted-foreground">{detail}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">{t("audit.showing", { count: data.length })}</p>
    </>
  );
}
