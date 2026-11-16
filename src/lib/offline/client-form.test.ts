import { describe, expect, test } from "vitest";
import { parseClientForm } from "./client-form";

const valid = {
  fullName: "  Kovács Anna ",
  phone: " +36 30 111 2222 ",
  email: " Anna@Pelda.HU ",
  address: "",
  notes: "",
  emailConsent: true,
};

describe("parseClientForm", () => {
  test("cleans the input the way the server does", () => {
    expect(parseClientForm(valid)).toEqual({
      ok: true,
      fields: {
        fullName: "Kovács Anna",
        phone: "+36 30 111 2222",
        email: "anna@pelda.hu",
        address: null,
        notes: null,
        emailConsent: true,
      },
    });
  });

  test("only the name is required", () => {
    const result = parseClientForm({ ...valid, fullName: "  ", phone: "", email: "" });
    expect(result).toEqual({ ok: false, errors: { fullName: "nameRequired" } });
    expect(parseClientForm({ ...valid, phone: "", email: "" }).ok).toBe(true);
  });

  test("a malformed e-mail address is refused", () => {
    expect(parseClientForm({ ...valid, email: "nem-email" })).toEqual({ ok: false, errors: { email: "emailInvalid" } });
  });

  test("over-long values are refused", () => {
    expect(parseClientForm({ ...valid, notes: "x".repeat(2001) })).toEqual({ ok: false, errors: { notes: "tooLong" } });
    expect(parseClientForm({ ...valid, fullName: "x".repeat(201) })).toEqual({ ok: false, errors: { fullName: "tooLong" } });
  });
});
