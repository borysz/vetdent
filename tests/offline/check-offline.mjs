/**
 * Offline check: the application must start and work without a connection,
 * and an edit made offline must reach the server afterwards (and, if someone
 * else changed the same field meanwhile, end up in the conflicts list).
 *
 * Opens the running PRODUCTION build (the service worker is only registered
 * there) in a real Chrome on this machine, signs in as a throw-away user and
 * cuts the connection with the browser's own offline switch, so this is a real
 * offline start (service worker answers, data comes from the device database).
 * It deletes what it created afterwards.
 *
 *   npm run build && npm run start        (in one terminal)
 *   BROWSER_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" npm run check:offline
 *
 * `BASE_URL` overrides http://localhost:3000. Edge does not start headless on
 * some machines; Chrome does.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SYNC_WAIT_MS = 60_000;

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
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("No Chrome found; set BROWSER_PATH.");
  return found;
}

const settings = env();
const admin = createClient(settings.NEXT_PUBLIC_SUPABASE_URL, settings.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function push(client, rpc, organizationId, changes) {
  const { data, error } = await client.rpc(rpc, { p_organization_id: organizationId, p_changes: changes });
  if (error) throw new Error(`${rpc}: ${error.message}`);
  return data;
}
const upsert = (id, baseRev, fields) => ({ id, op: "upsert", base_rev: baseRev, fields });

async function createFixture() {
  const runId = randomUUID().slice(0, 8);
  const email = `offline-${runId}@vetdent.test`;
  const password = `${randomUUID()}${randomUUID()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  const userId = created.data.user.id;

  const user = createClient(settings.NEXT_PUBLIC_SUPABASE_URL, settings.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
  const signedIn = await user.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const organization = await user.rpc("create_organization", { p_type: "individual", p_name: `Offline ${runId}` });
  if (organization.error) throw organization.error;
  const organizationId = organization.data;

  const clientId = randomUUID();
  const patientId = randomUUID();
  const visitId = randomUUID();
  await push(user, "sync_push_clients", organizationId, [upsert(clientId, null, { full_name: "Offline Gazdi" })]);
  await push(user, "sync_push_patients", organizationId, [upsert(patientId, null, { client_id: clientId, name: "Bodri", species: "dog" })]);
  await push(user, "sync_push_visits", organizationId, [upsert(visitId, null, { patient_id: patientId, visit_date: "2026-11-16", veterinarian_name: "Dr. Teszt" })]);
  return { email, password, userId, user, organizationId, patientId, visitId };
}

async function removeFixture(fixture) {
  await admin.from("organizations").delete().eq("id", fixture.organizationId);
  await admin.auth.admin.deleteUser(fixture.userId);
}

const failures = [];
function report(ok, what, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}${!ok && detail ? ` (${detail})` : ""}`);
  if (!ok) failures.push(what);
}

async function until(check, ms = SYNC_WAIT_MS, every = 1000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > end) return null;
    await sleep(every);
  }
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "vetdent-offline-"));
const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true, userDataDir: profile, args: ["--no-sandbox"] });
const fixture = await createFixture();

/** Types into the field with this label (replacing its text). */
async function typeInto(page, label, text) {
  const handle = await page.evaluateHandle((wanted) => [...document.querySelectorAll("label")].find((item) => item.textContent.trim().startsWith(wanted))?.control ?? null, label);
  const element = handle.asElement();
  if (!element) throw new Error(`no field "${label}"`);
  await element.focus();
  await page.evaluate((input) => input.select(), element);
  await page.keyboard.type(text);
}

const fieldValue = (page, label) =>
  page.evaluate((wanted) => [...document.querySelectorAll("label")].find((item) => item.textContent.trim().startsWith(wanted))?.control?.value ?? null, label);

const serverVisit = async () => (await admin.from("visits").select("veterinarian_name, rev").eq("id", fixture.visitId).single()).data;

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 834, height: 1194, deviceScaleFactor: 1, hasTouch: true });

  // -- online: sign in, let the data come to the device, visit the pages that must work offline ----
  await page.goto(`${BASE}/belepes`, { waitUntil: "networkidle0" });
  await page.type('input[type="email"]', fixture.email);
  await page.type('input[type="password"]', fixture.password);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click('button[type="submit"]')]);
  await sleep(6000);

  const worker = await page.evaluate(async () => {
    const registration = await Promise.race([navigator.serviceWorker.ready, new Promise((resolve) => setTimeout(() => resolve(null), 8000))]);
    return registration ? Boolean(registration.active) : false;
  });
  report(worker, "the service worker is active");

  const visitUrl = `${BASE}/app/vizitek/${fixture.visitId}`;
  const summaryUrl = `${visitUrl}/osszefoglalo`;
  const conflictsUrl = `${BASE}/app/utkozesek`;
  for (const url of [visitUrl, summaryUrl, conflictsUrl]) {
    await page.goto(url, { waitUntil: "networkidle0" });
    await sleep(3000);
  }
  await page.goto(visitUrl, { waitUntil: "networkidle0" });
  await sleep(2500);
  report((await fieldValue(page, "Kezelőorvos")) === "Dr. Teszt", "the visit shows the vet online");

  // -- offline start --------------------------------------------------------------------------
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: "domcontentloaded" }).catch(() => null);
  await sleep(4000);
  const offlineValue = await fieldValue(page, "Kezelőorvos");
  report(offlineValue === "Dr. Teszt", "the visit opens without a connection, with its data", `got ${JSON.stringify(offlineValue)}`);

  // -- offline edit ---------------------------------------------------------------------------
  await typeInto(page, "Kezelőorvos", "Dr. Teszt Offline");
  await sleep(2500);
  const saveText = await page.evaluate(() => [...document.querySelectorAll('[role="status"]')].map((item) => item.textContent).join(" "));
  report(/Mentve az eszközön/.test(saveText), "an offline edit is saved on the device", saveText.trim());
  report((await serverVisit()).veterinarian_name === "Dr. Teszt", "the server does not have it yet");

  // The summary built from the device shows the new value, offline.
  await page.goto(summaryUrl, { waitUntil: "domcontentloaded" }).catch(() => null);
  await sleep(4000);
  const summaryText = await page.evaluate(() => document.querySelector("article")?.innerText ?? "");
  report(summaryText.includes("Dr. Teszt Offline"), "the printable summary opens offline and shows the offline edit");

  // -- back online: the edit arrives ------------------------------------------------------------
  await page.setOfflineMode(false);
  const arrived = await until(async () => (await serverVisit()).veterinarian_name === "Dr. Teszt Offline");
  report(Boolean(arrived), "the offline edit reaches the server when the connection returns");

  // -- a conflict: the same field is changed elsewhere while this device is offline ---------------
  await page.goto(visitUrl, { waitUntil: "networkidle0" });
  await sleep(2500);
  const before = await serverVisit();
  await page.setOfflineMode(true);
  await typeInto(page, "Kezelőorvos", "Dr. Eszköz");
  await sleep(2500);
  await push(fixture.user, "sync_push_visits", fixture.organizationId, [upsert(fixture.visitId, before.rev, { veterinarian_name: "Dr. Másik" })]);
  await page.setOfflineMode(false);

  const conflict = await until(async () => {
    const { data } = await admin.from("sync_conflicts").select("field, overwritten_value, applied_value").eq("record_id", fixture.visitId).eq("field", "veterinarian_name");
    return data && data.length > 0 ? data[0] : null;
  });
  report(Boolean(conflict), "a change to the same field elsewhere is recorded as a conflict");
  report(conflict?.overwritten_value === "Dr. Másik" && conflict?.applied_value === "Dr. Eszköz", "the conflict keeps both values", JSON.stringify(conflict));
  report((await serverVisit()).veterinarian_name === "Dr. Eszköz", "the device's edit is the one that stands");

  // -- the conflicts page shows it ------------------------------------------------------------
  await page.goto(conflictsUrl, { waitUntil: "networkidle0" });
  await sleep(1500);
  const conflictsText = await page.evaluate(() => document.querySelector("main")?.innerText ?? "");
  report(conflictsText.includes("Dr. Másik") && conflictsText.includes("Dr. Eszköz") && conflictsText.includes("Kezelőorvos"), "the conflicts page lists the lost and the kept value");
  const navText = await page.evaluate(() => [...document.querySelectorAll("nav a")].map((link) => link.textContent).join("|"));
  report(/Ütközések \(1\)/.test(navText), "the navigation shows the number of open conflicts", navText);
} finally {
  await browser.close();
  fs.rmSync(profile, { recursive: true, force: true });
  await removeFixture(fixture);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} problem(s).`);
  process.exit(1);
}
console.log("\nOffline start, offline editing, synchronisation and conflicts work.");
