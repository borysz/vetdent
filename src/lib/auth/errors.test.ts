import { describe, expect, test } from "vitest";
import { authErrorKey } from "./errors";

describe("authErrorKey", () => {
  test("maps known Supabase error codes", () => {
    expect(authErrorKey({ code: "invalid_credentials" })).toBe("invalidCredentials");
    expect(authErrorKey({ code: "email_not_confirmed" })).toBe("emailNotConfirmed");
    expect(authErrorKey({ code: "weak_password" })).toBe("weakPassword");
    expect(authErrorKey({ code: "same_password" })).toBe("samePassword");
    expect(authErrorKey({ code: "otp_expired" })).toBe("linkInvalid");
  });

  test("treats rate limiting uniformly", () => {
    expect(authErrorKey({ code: "over_email_send_rate_limit" })).toBe("rateLimited");
    expect(authErrorKey({ code: "over_request_rate_limit" })).toBe("rateLimited");
    expect(authErrorKey({ status: 429 })).toBe("rateLimited");
  });

  test("never leaks unknown errors", () => {
    expect(authErrorKey({ code: "something_internal" })).toBe("generic");
    expect(authErrorKey({})).toBe("generic");
    expect(authErrorKey({ code: null, status: 500 })).toBe("generic");
    // A code that happens to be an Object.prototype member must not match.
    expect(authErrorKey({ code: "toString" })).toBe("generic");
  });
});
