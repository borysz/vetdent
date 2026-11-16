/** Where the worker script is served from. It lives in `public/`, so it controls the whole site. */
export const SERVICE_WORKER_URL = "/sw.js";

function isSupported(): boolean {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator;
}

/**
 * Registers the service worker (see `public/sw.js`). Only in production
 * builds: during development a worker would serve stale files and get in the
 * way of hot reloading. Failing to register is not an error for the user; the
 * application simply cannot start without a network.
 */
export async function registerServiceWorker(): Promise<void> {
  if (!isSupported() || process.env.NODE_ENV !== "production") return;
  try {
    await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/", updateViaCache: "none" });
  } catch {
    // Unsupported context (for example a private window); the online application still works.
  }
}

/**
 * Empties the worker's copies of the signed-in pages. Called on sign-out and
 * when the device is wiped, so the next person on a shared tablet cannot be
 * served the previous user's pages.
 */
export async function clearCachedPages(): Promise<void> {
  if (!isSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration("/");
    registration?.active?.postMessage({ type: "clear-pages" });
    // Also remove the cache directly: it works even when no worker is active.
    if (typeof caches !== "undefined") await caches.delete("vetdent-pages-v1");
  } catch {
    // Nothing cached, nothing to clear.
  }
}
