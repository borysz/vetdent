import { describe, expect, test } from "vitest";
import { parsePublicEnv } from "./env";

const supabase = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.test",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
};

describe("public environment", () => {
  test("falls back to the local development URL", () => {
    expect(parsePublicEnv(supabase).NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  test("accepts a valid app URL", () => {
    expect(
      parsePublicEnv({ ...supabase, NEXT_PUBLIC_APP_URL: "https://app.example.test" }).NEXT_PUBLIC_APP_URL,
    ).toBe("https://app.example.test");
  });

  test("rejects an invalid URL with a message that names the variable", () => {
    expect(() => parsePublicEnv({ ...supabase, NEXT_PUBLIC_APP_URL: "not a url" })).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  test("requires the Supabase settings", () => {
    expect(() => parsePublicEnv({})).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: supabase.NEXT_PUBLIC_SUPABASE_URL })).toThrow(
      /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    );
  });
});
