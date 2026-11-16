// @ts-check
/// <reference lib="webworker" />

/**
 * VetDent service worker: lets the signed-in area start without a network.
 *
 * It is a plain script on purpose (it runs outside the Next.js build, and has
 * to be served from the site root to control every page). It holds no data and
 * no secrets; the records themselves live in the device database (IndexedDB).
 *
 * - Static files (`/_next/static`, icons): cache first. Their names contain a
 *   content hash, so a cached copy can never be stale.
 * - Pages under `/app`: network first. A successful answer is kept, so the
 *   next start without a network can show the same page; the page then reads
 *   its data from the device database. If the exact page was never visited,
 *   the application start page is shown instead.
 * - Everything else (other origins such as Supabase, form posts, sign-in and
 *   auth routes) is not touched.
 *
 * The page cache holds a signed-in user's pages, so the application asks for
 * it to be emptied on sign-out and when the device is wiped (`clear-pages`).
 */

const sw = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (self));

const STATIC_CACHE = "vetdent-static-v1";
const PAGES_CACHE = "vetdent-pages-v1";
const APP_START = "/app";

sw.addEventListener("install", () => {
  void sw.skipWaiting();
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Drop caches of older versions of this worker.
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== STATIC_CACHE && name !== PAGES_CACHE).map((name) => caches.delete(name)),
      );
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear-pages") {
    event.waitUntil(caches.delete(PAGES_CACHE));
  }
});

sw.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/icon.svg") {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate" && (url.pathname === APP_START || url.pathname.startsWith(`${APP_START}/`))) {
    event.respondWith(networkFirstPage(request));
  }
});

/** @param {Request} request */
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

/** @param {Request} request */
async function networkFirstPage(request) {
  const cache = await caches.open(PAGES_CACHE);

  try {
    const response = await fetch(request);
    // A redirect (for example to the sign-in page) or an error is not the page; do not keep it.
    if (response.ok && !response.redirected && response.type === "basic") {
      await cache.put(pageKey(request.url), response.clone());
    }
    return response;
  } catch {
    const cached = (await cache.match(pageKey(request.url))) ?? (await cache.match(pageKey(APP_START)));
    if (cached) return cached;
    return Response.error();
  }
}

/**
 * Pages are kept by path only: the query string carries no page content here.
 * @param {string} url
 */
function pageKey(url) {
  const { origin, pathname } = new URL(url, sw.location.origin);
  return `${origin}${pathname}`;
}
