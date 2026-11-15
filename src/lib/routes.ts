/** Every path of the application in one place, so links never drift from routes. */
export const routes = {
  home: "/",
  login: "/belepes",
  signUp: "/regisztracio",
  forgotPassword: "/elfelejtett-jelszo",
  newPassword: "/uj-jelszo",
  authCallback: "/auth/callback",
  authConfirm: "/auth/confirm",
  onboarding: "/kezdes",
  app: "/app",
} as const;

/** Signed-in users only; everyone else is sent to the login page. */
export const protectedPrefixes: readonly string[] = [routes.app, routes.onboarding, routes.newPassword];

/** Pages that make no sense once signed in. */
export const guestOnlyPaths: readonly string[] = [routes.login, routes.signUp, routes.forgotPassword];

export function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Returns `next` only if it is a path inside this application; otherwise the
 * fallback. Prevents open redirects through the `?next=` parameter.
 */
export function safeNextPath(next: string | null | undefined, fallback: string = routes.app): string {
  if (!next) return fallback;
  // Must be an absolute path, and must not be protocol-relative ("//host") or use backslashes.
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  // Reject control characters that some browsers strip before resolving the URL.
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
