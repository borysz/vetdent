import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Refreshes the Supabase session for an incoming request and reports whether
 * the request is signed in. Runs in the proxy, before any rendering.
 *
 * The returned response carries the refreshed session cookies and MUST be the
 * one that is sent (or its cookies copied onto a redirect).
 */
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  isSignedIn: boolean;
  authUnreachable: boolean;
}> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // Responses that set auth cookies must never be cached by a CDN.
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // Verifies the token signature and refreshes it when needed. Do not run
  // other code between creating the client and this call.
  const { data, error } = await supabase.auth.getClaims();

  return {
    response,
    isSignedIn: Boolean(data?.claims),
    // Could not ask the auth server: the answer to "signed in?" is unknown, not "no".
    authUnreachable: Boolean(error && isAuthRetryableFetchError(error)),
  };
}
