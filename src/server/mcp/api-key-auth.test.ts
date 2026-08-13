import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";
import { MCP_OAUTH_SCOPES } from "@/lib/oauth-resource";
import type { handleAuthenticatedOpenSeoMcpRequest } from "@/server/mcp/transport";

const mocks = vi.hoisted(() => ({
  verifyApiKey: vi.fn(),
  getHostedUser: vi.fn(),
  getOrCreateDefaultHostedOrganization: vi.fn(),
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
  },
}));

vi.mock("@/server/auth/default-hosted-organization", () => ({
  getOrCreateDefaultHostedOrganization:
    mocks.getOrCreateDefaultHostedOrganization,
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

describe("handleMcpApiKeyRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getHostedUser.mockResolvedValue({
      id: "user-1",
      email: "person@example.com",
      name: "Person",
    });
    mocks.getOrCreateDefaultHostedOrganization.mockResolvedValue("org-1");
    mocks.recordMcpAuthorized.mockResolvedValue(undefined);
    mocks.handleAuthenticatedOpenSeoMcpRequest.mockResolvedValue(
      new Response("mcp response"),
    );
  });

  it("handles a valid key with the hosted user, organization, and MCP scopes", async () => {
    mocks.verifyApiKey.mockResolvedValue({
      valid: true,
      error: null,
      key: { referenceId: "user-1" },
    });
    const mcpRequest = request({ Authorization: "Bearer oseo_secret" });

    const response = await handleMcpApiKeyRequest(mcpRequest, env, ctx);

    expect(await response?.text()).toBe("mcp response");
    expect(mocks.verifyApiKey).toHaveBeenCalledWith({
      body: { key: "oseo_secret" },
    });
    expect(mocks.getOrCreateDefaultHostedOrganization).toHaveBeenCalledWith(
      "user-1",
      expect.any(Function),
    );
    expect(mocks.recordMcpAuthorized).toHaveBeenCalledWith("org-1");
    expect(mocks.handleAuthenticatedOpenSeoMcpRequest).toHaveBeenCalledTimes(1);
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
        scopes: [...MCP_OAUTH_SCOPES],
        clientId: "api_key",
        baseUrl: "https://app.openseo.so",
      },
    });
  });

  it("accepts the key via a case-insensitive bearer scheme", async () => {
    mocks.verifyApiKey.mockResolvedValue({
      valid: true,
      error: null,
      key: { referenceId: "user-1" },
    });

    await handleMcpApiKeyRequest(
      request({ Authorization: "bearer oseo_secret" }),
      env,
      ctx,
    );

    expect(mocks.verifyApiKey).toHaveBeenCalledWith({
      body: { key: "oseo_secret" },
    });
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

  it("returns 429 with Retry-After when Better Auth rate-limits the key", async () => {
    mocks.verifyApiKey.mockResolvedValue({
      valid: false,
      error: {
        code: "RATE_LIMITED",
        message: "Rate limit exceeded",
        details: { tryAgainIn: 30500 },
      },
      key: null,
    });

    const response = await handleMcpApiKeyRequest(
      request({ "x-api-key": "oseo_limited" }),
      env,
      ctx,
    );

    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("31");
    await expect(response?.json()).resolves.toMatchObject({
      error: "rate_limited",
    });
    expect(mocks.handleAuthenticatedOpenSeoMcpRequest).not.toHaveBeenCalled();
  });

  it("returns a JSON 500 when auth resolution throws", async () => {
    mocks.verifyApiKey.mockRejectedValue(new Error("db down"));

    const response = await handleMcpApiKeyRequest(
      request({ Authorization: "Bearer oseo_secret" }),
      env,
      ctx,
    );

    expect(response?.status).toBe(500);
    await expect(response?.json()).resolves.toMatchObject({
      error: "internal_error",
    });
    expect(mocks.handleAuthenticatedOpenSeoMcpRequest).not.toHaveBeenCalled();
  });

  it("leaves non-OpenSEO bearer tokens for OAuth", async () => {
    await expect(
      handleMcpApiKeyRequest(
        request({ Authorization: "Bearer oauth-access-token" }),
        env,
        ctx,
      ),
    ).resolves.toBeNull();
    expect(mocks.verifyApiKey).not.toHaveBeenCalled();
  });

  it("leaves non-OpenSEO x-api-key values for OAuth", async () => {
    await expect(
      handleMcpApiKeyRequest(
        request({
          "x-api-key": "some-foreign-key",
          Authorization: "Bearer oauth-access-token",
        }),
        env,
        ctx,
      ),
    ).resolves.toBeNull();
    expect(mocks.verifyApiKey).not.toHaveBeenCalled();
  });

  it("leaves requests without credentials for OAuth", async () => {
    await expect(
      handleMcpApiKeyRequest(request(), env, ctx),
    ).resolves.toBeNull();
    expect(mocks.verifyApiKey).not.toHaveBeenCalled();
  });

  it("leaves OPTIONS requests with API keys for the CORS handler", async () => {
    await expect(
      handleMcpApiKeyRequest(
        request({ "x-api-key": "oseo_secret" }, "OPTIONS"),
        env,
        ctx,
      ),
    ).resolves.toBeNull();
    expect(mocks.verifyApiKey).not.toHaveBeenCalled();
  });
});
