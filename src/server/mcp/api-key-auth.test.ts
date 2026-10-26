import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";
import { MCP_OAUTH_SCOPES } from "@/lib/oauth-resource";
import type { handleAuthenticatedOpenSeoMcpRequest } from "@/server/mcp/transport";

const mocks = vi.hoisted(() => ({
  verifyApiKey: vi.fn(),
  getHostedUser: vi.fn(),
  getMembership: vi.fn(),
  recordMcpAuthorized: vi.fn(),
  handleAuthenticatedOpenSeoMcpRequest:
    vi.fn<typeof handleAuthenticatedOpenSeoMcpRequest>(),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({
    api: {
      verifyApiKey: mocks.verifyApiKey,
      createOrganization: vi.fn(),
    },
  }),
  getHostedBaseUrl: () => "https://app.openseo.so",
}));

vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: {
    getHostedUser: mocks.getHostedUser,
    getMembership: mocks.getMembership,
  },
}));

vi.mock("@/server/features/activation/mcpActivation", () => ({
  recordMcpAuthorized: mocks.recordMcpAuthorized,
}));

vi.mock("@/server/mcp/transport", () => ({
  handleAuthenticatedOpenSeoMcpRequest:
    mocks.handleAuthenticatedOpenSeoMcpRequest,
}));

import { handleMcpApiKeyRequest } from "@/server/mcp/api-key-auth";

const env = {};
const ctx: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
};

function request(headers?: HeadersInit, method = "POST") {
  return new Request("https://app.openseo.so/mcp", { method, headers });
}

// What verifyApiKey returns for a key bound to org-1 at creation.
const boundKey = {
  valid: true,
  error: null,
  key: { referenceId: "user-1", metadata: { organizationId: "org-1" } },
};

describe("handleMcpApiKeyRequest", () => {
  beforeEach(() => {
    mocks.getHostedUser.mockResolvedValue({
      id: "user-1",
      email: "person@example.com",
    });
    mocks.getMembership.mockResolvedValue({ role: "owner" });
    mocks.recordMcpAuthorized.mockResolvedValue(undefined);
    mocks.handleAuthenticatedOpenSeoMcpRequest.mockResolvedValue(
      new Response("mcp response"),
    );
  });

  it.each([
    ["Bearer", { Authorization: "Bearer oseo_secret" }],
    ["case-insensitive bearer", { Authorization: "bearer oseo_secret" }],
    ["x-api-key", { "x-api-key": "oseo_secret" }],
  ])(
    "handles a valid key sent as %s with the hosted user, its bound organization, and MCP scopes",
    async (_label, headers) => {
      mocks.verifyApiKey.mockResolvedValue(boundKey);
      const mcpRequest = request(headers);

      const response = await handleMcpApiKeyRequest(mcpRequest, env, ctx);

      expect(await response?.text()).toBe("mcp response");
      expect(mocks.verifyApiKey).toHaveBeenCalledWith({
        body: { key: "oseo_secret" },
      });
      // The org comes from the key's metadata; the role from the live member
      // row in that org.
      expect(mocks.getMembership).toHaveBeenCalledWith("user-1", "org-1");
      expect(mocks.recordMcpAuthorized).toHaveBeenCalledWith("org-1");
      expect(mocks.handleAuthenticatedOpenSeoMcpRequest).toHaveBeenCalledTimes(
        1,
      );
      const [passedRequest, props, passedEnv, passedCtx] =
        mocks.handleAuthenticatedOpenSeoMcpRequest.mock.calls[0];
      expect(passedRequest).toBe(mcpRequest);
      expect(passedEnv).toBe(env);
      expect(passedCtx).toBe(ctx);
      expect(props).toMatchObject({
        [MCP_AUTH_CONTEXT_PROP]: {
          userId: "user-1",
          userEmail: "person@example.com",
          organizationId: "org-1",
          role: "owner",
          scopes: [...MCP_OAUTH_SCOPES],
          clientId: "api_key",
          baseUrl: "https://app.openseo.so",
        },
      });
    },
  );

  // A key that predates the org binding and was not backfilled is dead, not
  // rebound to whatever org the user is in now.
  it("returns 403 for a key with no organization in its metadata", async () => {
    mocks.verifyApiKey.mockResolvedValue({
      valid: true,
      error: null,
      key: { referenceId: "user-1", metadata: null },
    });

    const response = await handleMcpApiKeyRequest(
      request({ Authorization: "Bearer oseo_secret" }),
      env,
      ctx,
    );

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      error: "account_access_revoked",
    });
    expect(mocks.getMembership).not.toHaveBeenCalled();
    expect(mocks.handleAuthenticatedOpenSeoMcpRequest).not.toHaveBeenCalled();
  });

  it("returns 403 when the user was removed from the key's organization", async () => {
    mocks.verifyApiKey.mockResolvedValue(boundKey);
    mocks.getMembership.mockResolvedValue(null);

    const response = await handleMcpApiKeyRequest(
      request({ Authorization: "Bearer oseo_secret" }),
      env,
      ctx,
    );

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      error: "account_access_revoked",
    });
    expect(mocks.handleAuthenticatedOpenSeoMcpRequest).not.toHaveBeenCalled();
  });

  it("returns 401 for an invalid key without invoking the transport", async () => {
    mocks.verifyApiKey.mockResolvedValue({
      valid: false,
      error: { code: "INVALID_API_KEY" },
      key: null,
    });

    const response = await handleMcpApiKeyRequest(
      request({ "x-api-key": "oseo_revoked" }),
      env,
      ctx,
    );

    expect(response?.status).toBe(401);
    expect(response?.headers.has("WWW-Authenticate")).toBe(false);
    await expect(response?.json()).resolves.toMatchObject({
      error: "invalid_api_key",
    });
    expect(mocks.handleAuthenticatedOpenSeoMcpRequest).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After when the MCP_RATE_LIMIT binding denies", async () => {
    mocks.verifyApiKey.mockResolvedValue(boundKey);
    const limit = vi.fn().mockResolvedValue({ success: false });

    const response = await handleMcpApiKeyRequest(
      request({ "x-api-key": "oseo_limited" }),
      { MCP_RATE_LIMIT: { limit } },
      ctx,
    );

    expect(limit).toHaveBeenCalledWith({ key: "user-1" });
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("60");
    await expect(response?.json()).resolves.toMatchObject({
      error: "rate_limited",
    });
    expect(mocks.handleAuthenticatedOpenSeoMcpRequest).not.toHaveBeenCalled();
  });

  it.each([
    [
      "non-OpenSEO bearer tokens",
      request({ Authorization: "Bearer oauth-access-token" }),
    ],
    [
      "non-OpenSEO x-api-key values",
      request({
        "x-api-key": "some-foreign-key",
        Authorization: "Bearer oauth-access-token",
      }),
    ],
    [
      "OPTIONS requests with API keys",
      request({ "x-api-key": "oseo_secret" }, "OPTIONS"),
    ],
  ])(
    "leaves %s for the OAuth and CORS handlers",
    async (_label, mcpRequest) => {
      await expect(
        handleMcpApiKeyRequest(mcpRequest, env, ctx),
      ).resolves.toBeNull();
      expect(mocks.verifyApiKey).not.toHaveBeenCalled();
    },
  );
});
