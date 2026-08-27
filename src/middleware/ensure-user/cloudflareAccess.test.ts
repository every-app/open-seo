import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as CloudflareAccessModule from "./cloudflareAccess";

// Identity derivation is the whole security surface of this module: which
// claims become which user. Cloudflare Access token verification and the
// database are mocked so each case asserts only that mapping.

const mockEnv = vi.hoisted(() => ({
  TEAM_DOMAIN: "https://example.cloudflareaccess.com",
  POLICY_AUD: "test-aud",
}));

const jwtVerify = vi.hoisted(() => vi.fn());
const resolveSharedWorkspaceContext = vi.hoisted(() => vi.fn());

vi.mock("cloudflare:workers", () => ({ env: mockEnv }));
vi.mock("jose", () => ({
  createRemoteJWKSet: () => ({}),
  jwtVerify,
}));
vi.mock("./delegated", () => ({ resolveSharedWorkspaceContext }));

let resolveCloudflareAccessContext: typeof CloudflareAccessModule.resolveCloudflareAccessContext;

beforeEach(async () => {
  resolveSharedWorkspaceContext.mockImplementation(
    async (userId: string, userEmail: string) => ({
      userId,
      userEmail,
      emailVerified: true,
      organizationId: "org_shared",
    }),
  );
  ({ resolveCloudflareAccessContext } = await import("./cloudflareAccess"));
});

function headers() {
  return new Headers({ "cf-access-jwt-assertion": "token" });
}

describe("resolveCloudflareAccessContext", () => {
  it("maps a human Access token to its own identity", async () => {
    jwtVerify.mockResolvedValue({
      payload: { sub: "user-sub", email: "danny@example.com" },
    });

    await expect(resolveCloudflareAccessContext(headers())).resolves.toEqual({
      userId: "user-sub",
      userEmail: "danny@example.com",
      emailVerified: true,
      organizationId: "org_shared",
    });
  });

  it("maps a service token to a stable synthetic user in the shared workspace", async () => {
    // Exactly what Access issues for a Service Auth policy: empty sub, no
    // email, the token's Client ID in common_name.
    jwtVerify.mockResolvedValue({
      payload: { sub: "", common_name: "abc123.access" },
    });

    await expect(resolveCloudflareAccessContext(headers())).resolves.toEqual({
      userId: "access-service-token:abc123.access",
      userEmail: "abc123.access@service-token.invalid",
      emailVerified: true,
      organizationId: "org_shared",
    });
  });

  it("rejects a token carrying neither an email nor a service token name", async () => {
    jwtVerify.mockResolvedValue({ payload: { sub: "" } });

    await expect(resolveCloudflareAccessContext(headers())).rejects.toThrow();
    expect(resolveSharedWorkspaceContext).not.toHaveBeenCalled();
  });
});
