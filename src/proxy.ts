import { NextResponse, type NextRequest } from "next/server";
import { guestOnlyPaths, matchesPrefix, protectedPrefixes, routes } from "@/lib/routes";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Runs before every page request: refreshes the session cookies and performs
 * the optimistic redirects (not signed in → login, signed in → app).
 *
 * This is a convenience, not the security boundary. Every Server Action and
 * data read checks the session again, and the database enforces access with
 * row level security.
 */
export async function proxy(request: NextRequest) {
  const { response, isSignedIn } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  const redirectTo = (path: string, next?: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    if (next) url.searchParams.set("next", next);

    const redirect = NextResponse.redirect(url);
    // Keep the refreshed session cookies on the redirect response.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  };

  if (!isSignedIn && matchesPrefix(pathname, protectedPrefixes)) {
    return redirectTo(routes.login, `${pathname}${search}`);
  }

  if (isSignedIn && matchesPrefix(pathname, guestOnlyPaths)) {
    return redirectTo(routes.app);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and images.
    "/((?!_next/static|_next/image|icons/|icon\\.svg|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
