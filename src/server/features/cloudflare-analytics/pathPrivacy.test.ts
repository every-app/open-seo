import { describe, expect, it } from "vitest";
import { privacySafePath } from "./pathPrivacy";

describe("privacySafePath", () => {
  it.each([
    [undefined, "/"],
    ["login", "/login"],
    ["/login?email=private@example.com", "/login"],
    ["/reset/alice@example.com", "/reset/:redacted"],
    ["/reset/bob%2540example.com", "/reset/:redacted"],
    ["/tax/AR-CUIT-20-12345678-3", "/tax/:redacted"],
    ["/documents/550e8400-e29b-41d4-a716-446655440000", "/documents/:redacted"],
    ["/vehicles/AA123AA", "/vehicles/:redacted"],
    ["/sessions/aB3dE5fG7hI9jK1mN3pQ5rS7tV9x", "/sessions/:redacted"],
    ["/blog/normal-seo-page", "/blog/normal-seo-page"],
    ["/safe/\u0001slug", "/safe/slug"],
  ])("maps %s to a privacy-safe route shape", (input, expected) => {
    expect(privacySafePath(input)).toBe(expected);
  });

  it("redacts overlong segments rather than truncating identifiers", () => {
    expect(privacySafePath(`/download/${"a".repeat(129)}`)).toBe(
      "/download/:redacted",
    );
  });
});
