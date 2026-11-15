import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { routes, safeNextPath } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const OTP_TYPES: readonly EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email_change", "email"];

function isOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (OTP_TYPES as readonly string[]).includes(value);
}

/**
 * Landing point of e-mail links that carry a token hash (used when the e-mail
 * templates link straight to the app, which also works if the link is opened
 * on a different device than the one that requested it).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (tokenHash && isOtpType(type)) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const fallback = type === "recovery" ? routes.newPassword : routes.onboarding;
      return NextResponse.redirect(new URL(safeNextPath(searchParams.get("next"), fallback), origin));
    }
  }

  const failure = new URL(routes.login, origin);
  failure.searchParams.set("hiba", "hivatkozas");
  return NextResponse.redirect(failure);
}
