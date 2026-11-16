import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { applyPulled, type ClientFields, type ClientView, type ServerClient } from "./clients-model";
import { createClient, getClient, listClients, matchesSearch, normalizeForSearch, removeClient, updateClient } from "./clients-store";
import { LocalDatabase } from "./local-db";

const ORG = "org-1";
const fields = (overrides: Partial<ClientFields> = {}): ClientFields => ({
  fullName: "Kovács Anna",
  phone: "+36 30 111 2222",
  email: "anna@pelda.hu",
  address: "Budapest",
  notes: null,
  emailConsent: false,
  ...overrides,
});

const view = (overrides: Partial<ClientView> = {}): ClientView => ({
  id: "c1",
  isNew: false,
  hasPendingChanges: false,
  problem: null,
  ...fields(),
  ...overrides,
});

let db: LocalDatabase;
let counter = 0;

beforeEach(() => {
  counter += 1;
  db = new LocalDatabase(`store-test-${counter}`);
});

afterEach(async () => {
  db.close();
  await db.delete();
});

describe("search", () => {
  test("ignores case and accents", () => {
    expect(normalizeForSearch("KOVÁCS Őrs")).toBe("kovacs ors");
    expect(matchesSearch(view(), "kovacs")).toBe(true);
    expect(matchesSearch(view(), "KOVÁCS")).toBe(true);
    expect(matchesSearch(view(), "anna@")).toBe(true);
    expect(matchesSearch(view(), "budapest")).toBe(true);
  });

  test("finds phone numbers however they were typed", () => {
    expect(matchesSearch(view(), "30 111")).toBe(true);
    expect(matchesSearch(view(), "+36-30-111")).toBe(true);
    expect(matchesSearch(view(), "999")).toBe(false);
  });

  test("an empty search matches everyone, a short number does not match everything", () => {
    expect(matchesSearch(view(), "")).toBe(true);
    expect(matchesSearch(view(), "   ")).toBe(true);
    expect(matchesSearch(view({ phone: "123" }), "99")).toBe(false);
  });
});

describe("the local list", () => {
  test("a record is on the list the moment it is created, sorted by name in Hungarian order", async () => {
    await createClient(db, ORG, fields({ fullName: "Zsolt" }));
    await createClient(db, ORG, fields({ fullName: "Ábel" }));
    await createClient(db, ORG, fields({ fullName: "Béla" }));

    const names = (await listClients(db, ORG)).map((client) => client.fullName);
    expect(names).toEqual(["Ábel", "Béla", "Zsolt"]);
  });

  test("the search narrows the list", async () => {
    await createClient(db, ORG, fields({ fullName: "Kovács Anna" }));
    await createClient(db, ORG, fields({ fullName: "Nagy Béla", phone: null, email: null, address: null }));

    expect((await listClients(db, ORG, "nagy")).map((client) => client.fullName)).toEqual(["Nagy Béla"]);
  });

  test("another organization's records never appear", async () => {
    await createClient(db, ORG, fields());
    await createClient(db, "org-2", fields({ fullName: "Idegen" }));
    expect((await listClients(db, ORG)).map((client) => client.fullName)).toEqual(["Kovács Anna"]);
  });
});

describe("editing and deleting on the device", () => {
  test("edits show up at once and are marked as unsent", async () => {
    const id = await createClient(db, ORG, fields());
    await updateClient(db, id, { phone: "555" });
    expect(await getClient(db, id)).toMatchObject({ phone: "555", hasPendingChanges: true, isNew: true });
  });

  test("a record that never left the device vanishes without a trace when deleted", async () => {
    const id = await createClient(db, ORG, fields());
    await removeClient(db, id);
    expect(await getClient(db, id)).toBeNull();
    expect(await db.clients.get(id)).toBeUndefined();
  });

  test("a record the server knows is hidden at once, but kept as a queued delete", async () => {
    const server: ServerClient = {
      id: "s1",
      rev: 3,
      seq: 7,
      deletedAt: null,
      updatedAt: "2026-11-16T10:00:00Z",
      ...fields(),
    };
    await db.clients.put(applyPulled(undefined, server, ORG));

    await removeClient(db, "s1");
    expect(await getClient(db, "s1")).toBeNull();
    expect((await listClients(db, ORG)).length).toBe(0);
    expect((await db.clients.get("s1"))?.pendingDelete).toBe(true);
  });
});
