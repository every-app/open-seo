import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCloudflareAccessContext } from "./cloudflareAccess";
import { resolveSharedWorkspaceContext } from "./delegated";

const mockEnv = vi.hoisted(() => ({
  TEAM_DOMAIN: "https://team.cloudflareaccess.com",
  POLICY_AUD: "aud-tag",
  ACCESS_SERVICE_TOKEN_CLIENT_IDS: "cron-token.access, other-token.access",
}));

vi.mock("cloudflare:workers", () => ({ env: mockEnv }));
const mockJwtVerify = vi.hoisted(() => vi.fn());
vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(),
  jwtVerify: mockJwtVerify,
}));
vi.mock("./delegated", () => ({ resolveSharedWorkspaceContext: vi.fn() }));

const headers = new Headers({ "cf-access-jwt-assertion": "token" });

function verifiedPayload(payload: Record<string, unknown>) {
  mockJwtVerify.mockResolvedValue({ payload });
}

describe("resolveCloudflareAccessContext with service tokens", () => {
  beforeEach(() => {
    vi.mocked(resolveSharedWorkspaceContext).mockResolvedValue({
      userId: "resolved",
      userEmail: "resolved@example.com",
      emailVerified: true,
      organizationId: "shared-workspace",
      role: "owner",
    });
  });

  it("admits an allowlisted service token as its own user", async () => {
    verifiedPayload({ sub: "", common_name: "cron-token.access" });

    await resolveCloudflareAccessContext(headers);

    expect(resolveSharedWorkspaceContext).toHaveBeenCalledWith(
      "access-service-token:cron-token.access",
      "cron-token.access@service-token.invalid",
    );
  });

  it("rejects a service token that is not allowlisted", async () => {
    verifiedPayload({ sub: "", common_name: "unknown-token.access" });

    await expect(resolveCloudflareAccessContext(headers)).rejects.toMatchObject(
      { code: "UNAUTHENTICATED" },
    );
    expect(resolveSharedWorkspaceContext).not.toHaveBeenCalled();
  });
});
