import { NextResponse, type NextRequest } from "next/server";
import { routes, safeNextPath } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Landing point of e-mail links (confirmation, password reset) in the PKCE
 * flow: exchanges the one-time code for a session, then continues to `next`.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(safeNextPath(searchParams.get("next")), origin));
    }
  }

  const failure = new URL(routes.login, origin);
  failure.searchParams.set("hiba", "hivatkozas");
  return NextResponse.redirect(failure);
}
