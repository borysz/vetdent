import { describe, expect, test } from "vitest";
import { parsePublicEnv } from "./env";

describe("public environment", () => {
  test("falls back to the local development URL", () => {
    expect(parsePublicEnv({}).NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  test("accepts a valid URL", () => {
    expect(parsePublicEnv({ NEXT_PUBLIC_APP_URL: "https://app.example.test" }).NEXT_PUBLIC_APP_URL).toBe(
      "https://app.example.test",
    );
  });

  test("rejects an invalid URL with a message that names the variable", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_APP_URL: "not a url" })).toThrow(/NEXT_PUBLIC_APP_URL/);
  });
});
