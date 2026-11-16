import { describe, expect, test } from "vitest";
import {
  applyPulled,
  applyPushResult,
  deleteLocalClient,
  editLocalClient,
  hasPending,
  isDeleted,
  newLocalClient,
  pendingChange,
  viewOf,
  type ClientFields,
  type LocalClientRow,
  type ServerClient,
} from "./clients-model";

const ORG = "org-1";
const fields = (overrides: Partial<ClientFields> = {}): ClientFields => ({
  fullName: "Kovács Anna",
  phone: "111",
  email: null,
  address: null,
  notes: null,
  emailConsent: false,
  ...overrides,
});

const server = (overrides: Partial<ServerClient> = {}): ServerClient => ({
  id: "c1",
  rev: 1,
  seq: 10,
  deletedAt: null,
  updatedAt: "2026-11-16T10:00:00Z",
  ...fields(),
  ...overrides,
});

const synced = (overrides: Partial<ServerClient> = {}): LocalClientRow => applyPulled(undefined, server(overrides), ORG);

describe("a record created on the device", () => {
  const row = newLocalClient("c1", ORG, fields(), 1000);

  test("is shown immediately, marked as new and unsent", () => {
    expect(viewOf(row)).toMatchObject({ id: "c1", fullName: "Kovács Anna", isNew: true, hasPendingChanges: true });
  });

  test("is sent as a creation without a base revision", () => {
    expect(pendingChange(row)).toEqual({
      id: "c1",
      op: "upsert",
      base_rev: null,
      fields: { full_name: "Kovács Anna", phone: "111", email: null, address: null, notes: null, email_consent: false },
    });
  });

  test("keeps showing the entered values after the server accepted it, before the next pull", () => {
    const accepted = applyPushResult(row, { id: "c1", status: "applied", rev: 1 }, 2000)!;
    expect(hasPending(accepted)).toBe(false);
    expect(accepted.server?.rev).toBe(1);
    expect(viewOf(accepted)).toMatchObject({ fullName: "Kovács Anna", isNew: false, hasPendingChanges: false });
  });

  test("disappears without a trace if deleted before it was ever sent", () => {
    expect(deleteLocalClient(row, 3000)).toBeNull();
  });
});

describe("editing", () => {
  test("pending edits sit on top of the server's copy", () => {
    const edited = editLocalClient(synced(), { phone: "222" }, 5);
    expect(viewOf(edited)).toMatchObject({ phone: "222", fullName: "Kovács Anna", hasPendingChanges: true });
    expect(edited.server?.phone).toBe("111");
  });

  test("only the edited field is sent, with the revision it started from", () => {
    const edited = editLocalClient(synced({ rev: 4 }), { phone: "222" }, 5);
    expect(pendingChange(edited)).toEqual({ id: "c1", op: "upsert", base_rev: 4, fields: { phone: "222" } });
  });

  test("a second edit keeps the original base revision", () => {
    const first = editLocalClient(synced({ rev: 4 }), { phone: "222" }, 5);
    // A newer copy arrives in the meantime, then the user edits again.
    const pulled = applyPulled(first, server({ rev: 6, notes: "valaki más" }), ORG);
    const second = editLocalClient(pulled, { address: "Budapest" }, 6);

    expect(pendingChange(second)).toEqual({
      id: "c1",
      op: "upsert",
      base_rev: 4,
      fields: { phone: "222", address: "Budapest" },
    });
    expect(viewOf(second)).toMatchObject({ phone: "222", address: "Budapest", notes: "valaki más" });
  });

  test("setting a field back to the server's value cancels the edit", () => {
    const edited = editLocalClient(synced(), { phone: "222" }, 5);
    const reverted = editLocalClient(edited, { phone: "111" }, 6);
    expect(hasPending(reverted)).toBe(false);
    expect(pendingChange(reverted)).toBeNull();
    expect(reverted.pendingBaseRev).toBeNull();
  });

  test("clearing a field is an edit to null", () => {
    const edited = editLocalClient(synced(), { phone: null }, 5);
    expect(pendingChange(edited)?.fields).toEqual({ phone: null });
  });

  test("never modifies the row it was given", () => {
    const row = synced();
    const copy = JSON.parse(JSON.stringify(row));
    editLocalClient(row, { phone: "222" }, 5);
    expect(row).toEqual(copy);
  });
});

describe("deleting", () => {
  test("a record the server knows is deleted by a queued change", () => {
    const row = deleteLocalClient(editLocalClient(synced({ rev: 3 }), { phone: "9" }, 1), 2)!;
    expect(isDeleted(row)).toBe(true);
    expect(pendingChange(row)).toEqual({ id: "c1", op: "delete", base_rev: 3, fields: {} });
    expect(row.pending).toEqual({});
  });

  test("once the server confirms, the record is a tombstone", () => {
    const row = deleteLocalClient(synced(), 2)!;
    const done = applyPushResult(row, { id: "c1", status: "applied", rev: 2 }, 3)!;
    expect(hasPending(done)).toBe(false);
    expect(done.server?.deletedAt).not.toBeNull();
    expect(isDeleted(done)).toBe(true);
  });
});

describe("the server's answers", () => {
  test("a refused change is kept but not resent until the user edits again", () => {
    const edited = editLocalClient(synced(), { email: "nem-email" }, 5);
    const refused = applyPushResult(edited, { id: "c1", status: "invalid" }, 6)!;

    expect(refused.problem).toBe("invalid");
    expect(viewOf(refused).email).toBe("nem-email");
    expect(pendingChange(refused)).toBeNull();

    const fixed = editLocalClient(refused, { email: "jo@pelda.hu" }, 7);
    expect(fixed.problem).toBeNull();
    expect(pendingChange(fixed)?.fields).toEqual({ email: "jo@pelda.hu" });
  });

  test("an edit to a record someone deleted is dropped, and the delete stands", () => {
    const edited = editLocalClient(synced(), { phone: "5" }, 5);
    const result = applyPushResult(edited, { id: "c1", status: "deleted" }, 6)!;
    expect(isDeleted(result)).toBe(true);
    expect(hasPending(result)).toBe(false);
  });

  test("a creation the server says is forbidden stays visible as a problem", () => {
    const row = newLocalClient("c9", ORG, fields(), 1);
    const result = applyPushResult(row, { id: "c9", status: "forbidden" }, 2)!;
    expect(result.problem).toBe("forbidden");
    expect(viewOf(result).fullName).toBe("Kovács Anna");
  });
});

describe("pulling", () => {
  test("a new record from the server is stored as it is", () => {
    const row = applyPulled(undefined, server({ id: "c2", fullName: "Új Gazdi" }), ORG);
    expect(viewOf(row)).toMatchObject({ id: "c2", fullName: "Új Gazdi", isNew: false, hasPendingChanges: false });
  });

  test("an older or repeated copy changes nothing", () => {
    const row = synced({ rev: 5, fullName: "Újabb" });
    expect(applyPulled(row, server({ rev: 4, fullName: "Régebbi" }), ORG)).toBe(row);
    expect(applyPulled(row, server({ rev: 5, fullName: "Újabb" }), ORG)).toBe(row);
  });

  test("a newer copy replaces the server state but keeps pending edits on top", () => {
    const edited = editLocalClient(synced({ rev: 1 }), { phone: "222" }, 5);
    const pulled = applyPulled(edited, server({ rev: 2, notes: "szerveren", phone: "111" }), ORG);

    expect(viewOf(pulled)).toMatchObject({ phone: "222", notes: "szerveren" });
    expect(pendingChange(pulled)?.fields).toEqual({ phone: "222" });
  });

  test("an edit that the server now agrees with stops being pending", () => {
    const edited = editLocalClient(synced({ rev: 1 }), { phone: "222" }, 5);
    const pulled = applyPulled(edited, server({ rev: 2, phone: "222" }), ORG);
    expect(hasPending(pulled)).toBe(false);
    expect(pulled.pendingBaseRev).toBeNull();
  });

  test("a record deleted elsewhere takes the local edits with it", () => {
    const edited = editLocalClient(synced({ rev: 1 }), { phone: "222" }, 5);
    const pulled = applyPulled(edited, server({ rev: 2, deletedAt: "2026-11-16T11:00:00Z" }), ORG);
    expect(isDeleted(pulled)).toBe(true);
    expect(hasPending(pulled)).toBe(false);
  });
});
