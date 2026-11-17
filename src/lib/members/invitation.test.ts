import { describe, expect, test } from "vitest";
import { invitationTokenOf } from "./invitation-token";

const TOKEN = "02b936ee311144cb90458b667f93443f6760bee4deaa440c94b7003d9fd2df31";

describe("the token of an invitation link", () => {
  test("is read from the path of the invitation page", () => {
    expect(invitationTokenOf(`/meghivo/${TOKEN}`)).toBe(TOKEN);
    expect(invitationTokenOf(`/meghivo/${TOKEN}/`)).toBe(TOKEN);
  });

  test("anything else is not an invitation", () => {
    for (const next of [null, undefined, "", "/app", "/meghivo", "/meghivo/abc", `/meghivo/${TOKEN}x`, `/meghivo/${TOKEN.toUpperCase()}`, `//evil.example/meghivo/${TOKEN}`, `https://evil.example/meghivo/${TOKEN}`]) {
      expect(invitationTokenOf(next as string | null | undefined)).toBeNull();
    }
  });
});
