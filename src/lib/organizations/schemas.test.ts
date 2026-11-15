import { describe, expect, test } from "vitest";
import { createOrganizationSchema } from "./schemas";

const base = {
  name: "Mancs Állatorvosi Rendelő",
  taxNumber: "",
  postalCode: "",
  city: "",
  addressLine: "",
  phone: "",
  ownerIsClinician: false,
};

const issueFor = (input: unknown, fieldName: string) => {
  const result = createOrganizationSchema.safeParse(input);
  return result.success ? null : (result.error.issues.find((issue) => issue.path[0] === fieldName)?.message ?? null);
};

describe("create organization validation", () => {
  test("a clinic needs a tax number", () => {
    expect(issueFor({ ...base, type: "clinic" }, "taxNumber")).toBe("taxNumberRequired");
    expect(createOrganizationSchema.safeParse({ ...base, type: "clinic", taxNumber: "12345678-1-42" }).success).toBe(
      true,
    );
  });

  test("an individual veterinarian does not need a tax number", () => {
    expect(createOrganizationSchema.safeParse({ ...base, type: "individual" }).success).toBe(true);
  });

  test("the account type must be one of the two known types", () => {
    expect(issueFor({ ...base, type: "" }, "type")).toBe("typeRequired");
    expect(issueFor({ ...base, type: "platform" }, "type")).toBe("typeRequired");
  });

  test("the name is required and trimmed", () => {
    expect(issueFor({ ...base, type: "individual", name: "   " }, "name")).toBe("nameRequired");
    const ok = createOrganizationSchema.safeParse({ ...base, type: "individual", name: "  Dr. Kiss Anna  " });
    expect(ok.success && ok.data.name).toBe("Dr. Kiss Anna");
  });

  test("over-long values are rejected", () => {
    expect(issueFor({ ...base, type: "individual", city: "x".repeat(101) }, "city")).toBe("tooLong");
  });
});
