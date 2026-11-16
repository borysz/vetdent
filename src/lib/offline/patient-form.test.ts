import { describe, expect, test } from "vitest";
import { parsePatientForm, type PatientFormInput } from "./patient-form";

const now = new Date(2026, 10, 16, 12, 0, 0);

const valid: PatientFormInput = {
  clientId: "owner-1",
  name: "  Bodri ",
  species: "dog",
  breed: " keverék ",
  birthDate: "2019-05-17",
  sex: "male",
  neutered: true,
  weight: "18,5",
  microchip: "985112345678901",
  notes: "",
};

describe("parsePatientForm", () => {
  test("cleans the input the way the server does", () => {
    expect(parsePatientForm(valid, now)).toEqual({
      ok: true,
      fields: {
        clientId: "owner-1",
        name: "Bodri",
        species: "dog",
        breed: "keverék",
        birthDate: "2019-05-17",
        sex: "male",
        neutered: true,
        weightKg: 18.5,
        microchip: "985112345678901",
        notes: null,
      },
    });
  });

  test("only the owner, name and species are required", () => {
    const result = parsePatientForm(
      { ...valid, breed: "", birthDate: "", weight: "", microchip: "", notes: "", sex: "unknown", neutered: false },
      now,
    );
    expect(result.ok).toBe(true);
    expect(parsePatientForm({ ...valid, clientId: "", name: " " }, now)).toEqual({
      ok: false,
      errors: { clientId: "ownerRequired", name: "nameRequired" },
    });
  });

  test("only dogs and cats", () => {
    expect(parsePatientForm({ ...valid, species: "rabbit" }, now)).toEqual({
      ok: false,
      errors: { species: "speciesRequired" },
    });
  });

  test("weight accepts a comma or a dot and rejects nonsense", () => {
    expect(parsePatientForm({ ...valid, weight: "4.25" }, now)).toMatchObject({ ok: true, fields: { weightKg: 4.25 } });
    for (const weight of ["abc", "0", "-2", "201"]) {
      expect(parsePatientForm({ ...valid, weight }, now)).toEqual({ ok: false, errors: { weightKg: "weightInvalid" } });
    }
  });

  test("the birth date must be a real date that is not in the future", () => {
    expect(parsePatientForm({ ...valid, birthDate: "2026-11-16" }, now).ok).toBe(true);
    for (const birthDate of ["2026-11-17", "2020-02-30", "17.05.2019", "1980-01-01"]) {
      expect(parsePatientForm({ ...valid, birthDate }, now)).toEqual({
        ok: false,
        errors: { birthDate: "birthDateInvalid" },
      });
    }
  });

  test("the chip number is 9 to 20 letters or digits", () => {
    for (const microchip of ["123", "12345678901234567890123", "98511 2345"]) {
      expect(parsePatientForm({ ...valid, microchip }, now)).toEqual({
        ok: false,
        errors: { microchip: "microchipInvalid" },
      });
    }
  });
});
