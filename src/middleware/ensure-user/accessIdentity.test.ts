import { describe, expect, it } from "vitest";
import { resolveAccessIdentity } from "./accessIdentity";

/**
 * Which Cloudflare Access JWTs are allowed to become a user, and as whom.
 *
 * This is an authentication boundary, so the cases that must FAIL matter more than the ones
 * that must pass: a payload with neither a human identity nor a service identity has to be
 * rejected rather than quietly resolved to something.
 */
describe("resolveAccessIdentity", () => {
  it("accepts a user token and uses its own sub and email", () => {
    expect(
      resolveAccessIdentity({ sub: "user-123", email: "drew@example.com" }),
    ).toEqual({ userId: "user-123", userEmail: "drew@example.com" });
  });

  it("accepts a service token by common_name when sub and email are absent", () => {
    expect(resolveAccessIdentity({ common_name: "abc123.access" })).toEqual({
      userId: "cf-service-token:abc123.access",
      userEmail: "abc123.access@service.invalid",
    });
  });

  it("prefers the human identity when a token somehow carries both", () => {
    expect(
      resolveAccessIdentity({
        sub: "user-123",
        email: "drew@example.com",
        common_name: "abc123.access",
      }),
    ).toEqual({ userId: "user-123", userEmail: "drew@example.com" });
  });

  it("rejects a payload with no identity of either kind", () => {
    expect(resolveAccessIdentity({})).toBeNull();
  });

  it("rejects a user token missing its email rather than inventing one", () => {
    // The pre-existing contract: half a human identity is not an identity.
    expect(resolveAccessIdentity({ sub: "user-123" })).toBeNull();
  });

  it("rejects a blank or whitespace common_name", () => {
    expect(resolveAccessIdentity({ common_name: "   " })).toBeNull();
  });

  it("ignores non-string claims", () => {
    expect(
      resolveAccessIdentity({ sub: 1 as unknown as string, common_name: 2 as unknown as string }),
    ).toBeNull();
  });

  it("namespaces the service id so it cannot collide with a user's sub", () => {
    const service = resolveAccessIdentity({ common_name: "user-123" });
    const human = resolveAccessIdentity({ sub: "user-123", email: "a@b.com" });

    expect(service?.userId).not.toEqual(human?.userId);
  });
});
