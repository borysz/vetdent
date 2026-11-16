import { describe, expect, test } from "vitest";
import {
  createRecoveryCode,
  formatRecoveryCode,
  hashRecoveryCode,
  isRecoveryCodeShaped,
  normalizeRecoveryCode,
} from "./recovery-code-format";

describe("recovery codes", () => {
  test("generated codes have the expected shape and are all different", () => {
    const codes = Array.from({ length: 200 }, createRecoveryCode);
    for (const code of codes) {
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
      expect(isRecoveryCodeShaped(code)).toBe(true);
    }
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("typing style does not matter", () => {
    expect(normalizeRecoveryCode(" abcd-efgh jkmn ")).toBe("ABCDEFGHJKMN");
    expect(hashRecoveryCode("abcd efgh jkmn")).toBe(hashRecoveryCode("ABCD-EFGH-JKMN"));
    expect(formatRecoveryCode("abcdefghjkmn")).toBe("ABCD-EFGH-JKMN");
  });

  test("different codes hash differently, and the hash is not the code", () => {
    expect(hashRecoveryCode("ABCD-EFGH-JKMN")).not.toBe(hashRecoveryCode("ABCD-EFGH-JKMP"));
    expect(hashRecoveryCode("ABCD-EFGH-JKMN")).toMatch(/^[0-9a-f]{64}$/);
  });

  test("malformed input is rejected before touching the database", () => {
    expect(isRecoveryCodeShaped("")).toBe(false);
    expect(isRecoveryCodeShaped("ABCD-EFGH")).toBe(false);
    expect(isRecoveryCodeShaped("ABCD-EFGH-JKM0")).toBe(false);
    expect(isRecoveryCodeShaped("123456")).toBe(false);
  });
});
