// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Runs the real `public/sw.js` against a small in-memory stand-in for the
 * worker environment (caches, fetch, events), so its rules are tested without
 * a browser.
 */

const ORIGIN = "https://vetdent.test";
const script = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

type Listener = (event: Record<string, unknown>) => void;

class FakeCache {
  store = new Map<string, Response>();
  async match(key: string | Request) {
    return this.store.get(typeof key === "string" ? key : key.url)?.clone();
  }
  async put(key: string | Request, response: Response) {
    this.store.set(typeof key === "string" ? key : key.url, response);
  }
}

function makeEnvironment(network: (request: Request) => Promise<Response>) {
  const listeners = new Map<string, Listener>();
  const cacheMap = new Map<string, FakeCache>();
  const caches = {
    open: async (name: string) => {
      if (!cacheMap.has(name)) cacheMap.set(name, new FakeCache());
      return cacheMap.get(name)!;
    },
    keys: async () => [...cacheMap.keys()],
    delete: async (name: string) => cacheMap.delete(name),
  };
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  };
  new Function("self", "caches", "fetch", "Response", "URL", script)(self, caches, network, Response, URL);

  /** Fires a fetch event; resolves to the response the worker gave, or null if it did not handle it. */
  async function dispatchFetch(request: Request): Promise<Response | null> {
    let answer: Promise<Response> | null = null;
    listeners.get("fetch")!({ request, respondWith: (p: Promise<Response>) => (answer = p) });
    return answer;
  }

  async function dispatchMessage(data: unknown): Promise<void> {
    const waits: Promise<unknown>[] = [];
    listeners.get("message")!({ data, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }

  return { cacheMap, dispatchFetch, dispatchMessage };
}

/** A request the way the browser makes it. `mode` cannot be set on a plain Request, so it is attached. */
function navigation(path: string): Request {
  const request = new Request(`${ORIGIN}${path}`);
  Object.defineProperty(request, "mode", { value: "navigate" });
  return request;
}

/** An answer from the same origin; the browser reports those as type "basic". */
function page(text: string, init?: ResponseInit): Response {
  const response = new Response(text, { status: 200, ...init });
  Object.defineProperty(response, "type", { value: "basic" });
  return response;
}

describe("service worker", () => {
  let online: boolean;
  let pages: Record<string, () => Response>;

  const network = async (request: Request): Promise<Response> => {
    if (!online) throw new TypeError("network down");
    const path = new URL(request.url).pathname;
    return pages[path]?.() ?? new Response("missing", { status: 404 });
  };

  beforeEach(() => {
    online = true;
    pages = {
      "/app": () => page("start"),
      "/app/gazdik": () => page("clients"),
      "/_next/static/app.abc123.js": () => page("code"),
    };
  });

  it("serves a visited page from the cache when the network is gone", async () => {
    const sw = makeEnvironment(network);
    await (await sw.dispatchFetch(navigation("/app/gazdik")))!.text();

    online = false;
    const offline = await sw.dispatchFetch(navigation("/app/gazdik"));
    expect(await offline!.text()).toBe("clients");
  });

  it("falls back to the start page for a page that was never visited", async () => {
    const sw = makeEnvironment(network);
    await sw.dispatchFetch(navigation("/app"));

    online = false;
    const offline = await sw.dispatchFetch(navigation("/app/paciensek"));
    expect(await offline!.text()).toBe("start");
  });

  it("fails like a normal offline browser when nothing is cached", async () => {
    const sw = makeEnvironment(network);
    online = false;
    const offline = await sw.dispatchFetch(navigation("/app"));
    expect(offline!.type).toBe("error");
  });

  it("prefers the network while it is available", async () => {
    const sw = makeEnvironment(network);
    await sw.dispatchFetch(navigation("/app/gazdik"));
    pages["/app/gazdik"] = () => page("clients, newer");

    const fresh = await sw.dispatchFetch(navigation("/app/gazdik"));
    expect(await fresh!.text()).toBe("clients, newer");
  });

  it("does not keep error pages or redirects", async () => {
    const sw = makeEnvironment(network);
    pages["/app/gazdik"] = () => page("boom", { status: 500 });
    await sw.dispatchFetch(navigation("/app/gazdik"));
    expect(sw.cacheMap.get("vetdent-pages-v1")?.store.size ?? 0).toBe(0);

    pages["/app/gazdik"] = () => {
      const redirected = page("sign in");
      Object.defineProperty(redirected, "redirected", { value: true });
      return redirected;
    };
    await sw.dispatchFetch(navigation("/app/gazdik"));
    expect(sw.cacheMap.get("vetdent-pages-v1")?.store.size ?? 0).toBe(0);
  });

  it("forgets every cached page when asked (sign-out, device wipe)", async () => {
    const sw = makeEnvironment(network);
    await sw.dispatchFetch(navigation("/app/gazdik"));
    await sw.dispatchMessage({ type: "clear-pages" });

    online = false;
    const offline = await sw.dispatchFetch(navigation("/app/gazdik"));
    expect(offline!.type).toBe("error");
  });

  it("keeps static files for good, cache first", async () => {
    const sw = makeEnvironment(network);
    const request = new Request(`${ORIGIN}/_next/static/app.abc123.js`);
    await (await sw.dispatchFetch(request))!.text();

    online = false;
    expect(await (await sw.dispatchFetch(request))!.text()).toBe("code");
  });

  it("leaves everything else alone", async () => {
    const sw = makeEnvironment(network);
    // Other origins (the database), form posts, public and auth pages.
    expect(await sw.dispatchFetch(new Request("https://project.supabase.co/rest/v1/rpc/x"))).toBeNull();
    expect(await sw.dispatchFetch(new Request(`${ORIGIN}/app/gazdik`, { method: "POST", body: "x" }))).toBeNull();
    expect(await sw.dispatchFetch(navigation("/belepes"))).toBeNull();
    expect(await sw.dispatchFetch(navigation("/auth/confirm"))).toBeNull();
    // An in-page data request under /app is not a navigation.
    expect(await sw.dispatchFetch(new Request(`${ORIGIN}/app/gazdik?_rsc=1`))).toBeNull();
  });
});
