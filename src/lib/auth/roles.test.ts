import { describe, expect, test } from "vitest";
import { assignableRoles, canManageMember, INVITABLE_ROLES, isManager, isMemberRole } from "./roles";

describe("roles", () => {
  test("only owners and admins are managers", () => {
    expect(isManager("owner")).toBe(true);
    expect(isManager("admin")).toBe(true);
    expect(isManager("vet")).toBe(false);
    expect(isManager("assistant")).toBe(false);
    expect(isManager("receptionist")).toBe(false);
  });

  test("ownership cannot be invited", () => {
    expect(INVITABLE_ROLES).not.toContain("owner");
  });

  test("an owner may assign any role, an admin anything but owner, others nothing", () => {
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("admin")).not.toContain("owner");
    expect(assignableRoles("admin")).toContain("admin");
    expect(assignableRoles("vet")).toEqual([]);
  });

  test("only an owner may manage an owner", () => {
    expect(canManageMember("owner", "owner")).toBe(true);
    expect(canManageMember("admin", "owner")).toBe(false);
    expect(canManageMember("admin", "vet")).toBe(true);
    expect(canManageMember("vet", "assistant")).toBe(false);
  });

  test("role names from a form are validated", () => {
    expect(isMemberRole("vet")).toBe(true);
    expect(isMemberRole("superuser")).toBe(false);
    expect(isMemberRole("")).toBe(false);
  });
});
