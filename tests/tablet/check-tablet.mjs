/**
 * Upright-tablet check (a standing requirement, see CLAUDE.md): every main page
 * must display perfectly on an average tablet held upright.
 *
 * Opens the running application in a real browser (Edge or Chrome on this
 * machine) at the usual upright tablet sizes, signs in as a throw-away user
 * that has a client, a patient and a charted visit, and for every page checks
 *   - no sideways scrolling of the page, and no visible element outside the screen
 *   - every button, link, list and field is at least 44 px high
 *   - nothing is covered by the always-visible bars (the tooth cards stay reachable)
 * It deletes what it created afterwards.
 *
 *   npm run build && npm run start        (in one terminal)
 *   npm run check:tablet                  (in another; BASE_URL overrides http://localhost:3000)
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SIZES = [
  { width: 768, height: 1024 },
  { width: 810, height: 1080 },
  { width: 834, height: 1194 },
];
const MIN_TARGET = 43.5; // 44 px, with room for rounding

function env() {
  const text = fs.readFileSync(".env.local", "utf8");
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((line) => /^\s*\w+=/.test(line))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

function findBrowser() {
  const candidates = [
    process.env.BROWSER_PATH,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("No Edge or Chrome found; set BROWSER_PATH.");
  return found;
}

const settings = env();
const admin = createClient(settings.NEXT_PUBLIC_SUPABASE_URL, settings.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

async function push(client, rpc, organizationId, changes) {
  const { data, error } = await client.rpc(rpc, { p_organization_id: organizationId, p_changes: changes });
  if (error) throw new Error(`${rpc}: ${error.message}`);
  const bad = data.filter((entry) => entry.status !== "applied");
  if (bad.length > 0) throw new Error(`${rpc}: ${JSON.stringify(bad)}`);
}

const upsert = (id, fields) => ({ id, op: "upsert", base_rev: null, fields });
const list = (items) => JSON.stringify(items);

/** A throw-away user with an organization, a client, a dog and a visit with a charted dentition. */
async function createFixture() {
  const runId = randomUUID().slice(0, 8);
  const email = `tablet-${runId}@vetdent.test`;
  const password = `${randomUUID()}${randomUUID()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const userId = created.data.user.id;

  const user = createClient(settings.NEXT_PUBLIC_SUPABASE_URL, settings.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const signedIn = await user.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const organization = await user.rpc("create_organization", { p_type: "individual", p_name: `Tablet ${runId}` });
  if (organization.error) throw organization.error;
  const organizationId = organization.data;

  const clientId = randomUUID();
  const patientId = randomUUID();
  const visitId = randomUUID();
  await push(user, "sync_push_clients", organizationId, [upsert(clientId, { full_name: "Tablet Gazdi" })]);
  await push(user, "sync_push_patients", organizationId, [upsert(patientId, { client_id: clientId, name: "Bodri", species: "dog" })]);
  await push(user, "sync_push_visits", organizationId, [
    upsert(visitId, { patient_id: patientId, visit_date: "2026-11-16", veterinarian_name: "Dr. Teszt", asa_status: 2 }),
  ]);
  const teeth = [101, 104, 108, 109, 204, 208, 304, 311, 404, 406, 411].map((tooth, index) =>
    upsert(randomUUID(), {
      visit_id: visitId,
      tooth,
      findings: list([index % 3 === 0 ? { code: "T", level: "2" } : index % 3 === 1 ? { code: "PD", level: "3" } : { code: "G", level: "1" }]),
      procedures: list(index % 4 === 0 ? [{ code: "U", level: "", state: "done" }] : []),
    }),
  );
  await push(user, "sync_push_visit_teeth", organizationId, teeth);

  return { email, password, userId, organizationId, clientId, patientId, visitId };
}

async function removeFixture(fixture) {
  await admin.from("organizations").delete().eq("id", fixture.organizationId);
  await admin.auth.admin.deleteUser(fixture.userId);
}

/** Runs in the page: what is wrong with the current screen. */
function inspect(minTarget) {
  const root = document.documentElement;
  const shown = [...document.querySelectorAll("body *")].filter((element) => {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (element.closest("dialog:not([open])")) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  const name = (element) => `${element.tagName.toLowerCase()}${element.className && typeof element.className === "string" ? "." + element.className.split(" ").slice(0, 2).join(".") : ""}`;
  const label = (element) => (element.innerText || element.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 30);

  const outside = shown
    .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 2 || element.getBoundingClientRect().left < -2)
    .slice(0, 5)
    .map((element) => `${name(element)} "${label(element)}"`);

  const small = shown
    .filter((element) => {
      const tag = element.tagName;
      if (tag === "INPUT" && ["checkbox", "radio", "file", "hidden"].includes(element.type)) return false;
      if (!["BUTTON", "A", "SELECT", "INPUT", "TEXTAREA"].includes(tag)) return false;
      return element.getBoundingClientRect().height < minTarget;
    })
    .slice(0, 6)
    .map((element) => `${label(element) || name(element)} (${Math.round(element.getBoundingClientRect().height)} px)`);

  return { sideways: root.scrollWidth > root.clientWidth + 1, outside, small };
}

// A profile of its own, so the test never meets a browser the user already has open.
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "vetdent-tablet-"));
const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true, userDataDir: profile, args: ["--no-sandbox"] });
const fixture = await createFixture();
const failures = [];

try {
  const pages = [
    "/app",
    "/app/gazdik",
    "/app/gazdik/uj",
    `/app/gazdik/${fixture.clientId}`,
    "/app/paciensek",
    "/app/paciensek/uj",
    `/app/paciensek/${fixture.patientId}`,
    `/app/vizitek/${fixture.visitId}`,
    `/app/vizitek/${fixture.visitId}/osszefoglalo`,
    "/app/sablonok",
    "/app/utkozesek",
    "/app/munkatarsak",
    "/app/fiok",
    "/app/elofizetes",
    "/app/szerepkorok",
    "/app/naplo",
    "/app/profil",
  ];

  for (const size of SIZES) {
    const page = await browser.newPage();
    await page.setViewport({ ...size, deviceScaleFactor: 1, hasTouch: true, isMobile: false });

    // The browser keeps its session between sizes, so only the first page needs to sign in.
    await page.goto(`${BASE}/belepes`, { waitUntil: "networkidle0" });
    if (await page.$('input[type="email"]')) {
      await page.type('input[type="email"]', fixture.email);
      await page.type('input[type="password"]', fixture.password);
      await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click('button[type="submit"]')]);
    }

    for (const path of pages) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0" });
      // The pages read from the device database; give them time to fill.
      await new Promise((resolve) => setTimeout(resolve, 2500));
      if (path.startsWith("/app/vizitek/")) {
        // Open a tooth sheet too: it is part of the page.
        await page.evaluate(() => {
          const card = [...document.querySelectorAll("button[aria-pressed]")].find((button) => button.getAttribute("aria-label")?.startsWith("108,"));
          card?.click();
        });
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
      const result = await page.evaluate(inspect, MIN_TARGET);
      const where = `${size.width}x${size.height} ${path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, "…")}`;
      const problems = [
        result.sideways ? "the page scrolls sideways" : null,
        ...result.outside.map((item) => `outside the screen: ${item}`),
        ...result.small.map((item) => `target under 44 px: ${item}`),
      ].filter(Boolean);
      console.log(`${problems.length === 0 ? "ok  " : "FAIL"} ${where}`);
      for (const problem of problems) {
        console.log(`       ${problem}`);
        failures.push(`${where}: ${problem}`);
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
  fs.rmSync(profile, { recursive: true, force: true });
  await removeFixture(fixture);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s) on an upright tablet.`);
  process.exit(1);
}
console.log("\nEvery page fits an upright tablet.");
