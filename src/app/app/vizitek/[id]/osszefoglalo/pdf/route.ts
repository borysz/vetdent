import { getTranslations } from "next-intl/server";
import { NextResponse } from "next/server";
import { buildSummary, type Translate } from "@/domain/summary/summary";
import { getCurrentUser, getActiveMembership, getPermissions } from "@/lib/auth/dal";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { downloadPhotos, loadSummary } from "@/lib/summary/load";
import { parsePhotoIds } from "@/lib/summary/organization";
import { renderSummaryPdf } from "@/lib/summary/pdf";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A file name without accents or anything a header could trip over. */
function fileNamePart(text: string): string {
  const plain = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return plain === "" ? "kezeles" : plain.slice(0, 40);
}

function refuse(status: number): Response {
  return new NextResponse(null, { status, headers: { "Cache-Control": "private, no-store" } });
}

/**
 * The summary for the animal's owner as a PDF. It is read with the signed-in
 * user's own session (row level security), and needs the right to send
 * summaries: of a draft any, of a finished record the finalized-summary right.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  if (!UUID.test(id)) return refuse(404);

  const user = await getCurrentUser();
  if (!user || user.mfaPending) return refuse(401);
  const membership = await getActiveMembership();
  if (!membership) return refuse(403);

  const photoIds = parsePhotoIds(new URL(request.url).searchParams.get("fotok"));
  const supabase = await createSupabaseServerClient();
  const loaded = await loadSummary(supabase, id, photoIds);
  // A visit of another practice is not visible anyway; the check keeps the answer the same if it ever were.
  if (!loaded || loaded.organizationId !== membership.organization.id) return refuse(404);

  const permissions = await getPermissions();
  const allowed =
    permissions.has("summary.send_any") || (loaded.input.visit.status === "final" && permissions.has("summary.send_finalized"));
  if (!allowed) return refuse(403);

  const translator = await getTranslations();
  const t: Translate = (key, values) => translator(key as never, values as never);
  const summary = buildSummary(loaded.input, t);
  const images = await downloadPhotos(supabase, loaded.organizationId, loaded.photoIds);
  const pdf = await renderSummaryPdf(summary, { images, title: `${t("summary.title")} – ${loaded.input.patient.name}` });

  const fileName = `osszefoglalo-${fileNamePart(loaded.input.patient.name)}-${loaded.input.visit.date.slice(0, 10)}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
