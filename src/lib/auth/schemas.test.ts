import { describe, expect, test } from "vitest";
import { loginSchema, newPasswordSchema, signUpSchema } from "./schemas";

const firstMessage = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? null : result.error?.issues[0]?.message;

describe("auth form validation", () => {
  test("normalises the e-mail address", () => {
    const result = loginSchema.safeParse({ email: "  Valaki@Pelda.HU ", password: "x" });
    expect(result.success && result.data.email).toBe("valaki@pelda.hu");
  });

  test("rejects malformed e-mail addresses", () => {
    expect(firstMessage(loginSchema.safeParse({ email: "nem-email", password: "x" }))).toBe("emailInvalid");
    expect(firstMessage(loginSchema.safeParse({ email: "", password: "x" }))).toBe("emailInvalid");
  });

  test("login only requires that a password is present", () => {
    expect(loginSchema.safeParse({ email: "a@b.hu", password: "rövid" }).success).toBe(true);
    expect(firstMessage(loginSchema.safeParse({ email: "a@b.hu", password: "" }))).toBe("passwordRequired");
  });

  test("new passwords need at least 10 characters", () => {
    expect(firstMessage(newPasswordSchema.safeParse({ password: "123456789" }))).toBe("passwordTooShort");
    expect(newPasswordSchema.safeParse({ password: "1234567890" }).success).toBe(true);
  });

  test("sign-up requires a name", () => {
    const base = { email: "a@b.hu", password: "1234567890" };
    expect(firstMessage(signUpSchema.safeParse({ ...base, fullName: "   " }))).toBe("fullNameRequired");
    const ok = signUpSchema.safeParse({ ...base, fullName: "  Dr. Kiss Anna " });
    expect(ok.success && ok.data.fullName).toBe("Dr. Kiss Anna");
  });
});
