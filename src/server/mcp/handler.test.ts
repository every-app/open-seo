import type { CreateMcpHandlerOptions } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const verifyMocks = vi.hoisted(() => ({
  verifyJwsAccessToken: vi.fn(),
}));

const serverMocks = vi.hoisted(() => ({
  nextServerId: 0,
  createdServerIds: [] as number[],
  serverIds: new WeakMap<McpServer, number>(),
}));

vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getJwks: vi.fn() } }),
  getHostedBaseUrl: () => "https://open-seo.test",
  hasHostedAuthConfig: () => true,
}));

vi.mock("better-auth/oauth2", () => ({
  verifyJwsAccessToken: verifyMocks.verifyJwsAccessToken,
}));

vi.mock("@/server/mcp/server", () => ({
  createOpenSeoMcpServer: () => {
    serverMocks.nextServerId += 1;
    const server = new McpServer({ name: "Test MCP", version: "0.0.0" });
    serverMocks.createdServerIds.push(serverMocks.nextServerId);
    serverMocks.serverIds.set(server, serverMocks.nextServerId);
    return server;
  },
}));

vi.mock("agents/mcp", () => ({
  createMcpHandler: (_server: McpServer, options: CreateMcpHandlerOptions) => {
    return async () =>
      new Response(
        JSON.stringify({
          serverId: serverMocks.serverIds.get(_server),
          options,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
  },
}));

const ctx: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
};

const transportOptionsSchema = z.object({
  serverId: z.number().optional(),
  options: z.object({
    route: z.string().optional(),
    enableJsonResponse: z.boolean().optional(),
    authContext: z
      .object({
        props: z.record(z.string(), z.unknown()),
      })
      .optional(),
  }),
});

function createMcpRequest(token: string) {
  return new Request("https://open-seo.test/mcp", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }),
  });
}

const jwtShapedToken = "header.payload.signature";
const organizationIdClaim = "https://open-seo.test/mcp/claims/organization-id";

function createAccessTokenPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    sub: "user_123",
    azp: "client_123",
    scope: "offline_access mcp",
    aud: "https://open-seo.test/mcp",
    [organizationIdClaim]: "org_123",
    ...overrides,
  };
}

describe("handleMcpRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverMocks.nextServerId = 0;
    serverMocks.createdServerIds = [];
    serverMocks.serverIds = new WeakMap<McpServer, number>();
    verifyMocks.verifyJwsAccessToken.mockResolvedValue(
      createAccessTokenPayload(),
    );
  });

  it("accepts access tokens verified by Better Auth", async () => {
    const { handleMcpRequest } = await import("@/server/mcp/handler");

    const response = await handleMcpRequest(
      createMcpRequest(jwtShapedToken),
      {
        AUTH_MODE: "hosted",
      },
      ctx,
    );
    const body = transportOptionsSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(
      body.options.authContext?.props[MCP_AUTH_CONTEXT_PROP],
    ).toMatchObject({
      userId: "user_123",
      organizationId: "org_123",
      clientId: "client_123",
      scopes: ["offline_access", "mcp"],
    });
    expect(body.options.route).toBe("/mcp");
    expect(body.options.enableJsonResponse).toBe(true);

    const functionMatcher: unknown = expect.any(Function);
    expect(verifyMocks.verifyJwsAccessToken).toHaveBeenCalledWith(
      jwtShapedToken,
      expect.objectContaining({
        verifyOptions: {
          audience: "https://open-seo.test/mcp",
          issuer: "https://open-seo.test/api/auth",
        },
        jwksFetch: functionMatcher,
      }),
    );
  });

  it("creates a fresh server for each request without persisted transport state", async () => {
    const { handleMcpRequest } = await import("@/server/mcp/handler");

    const first = await handleMcpRequest(
      createMcpRequest(jwtShapedToken),
      {
        AUTH_MODE: "hosted",
      },
      ctx,
    );
    const second = await handleMcpRequest(
      createMcpRequest(jwtShapedToken),
      {
        AUTH_MODE: "hosted",
      },
      ctx,
    );
    const firstBody = transportOptionsSchema.parse(await first.json());
    const secondBody = transportOptionsSchema.parse(await second.json());

    expect(serverMocks.createdServerIds).toEqual([1, 2]);
    expect(firstBody.serverId).toBe(1);
    expect(secondBody.serverId).toBe(2);
    expect(firstBody.options).not.toHaveProperty("sessionIdGenerator");
    expect(firstBody.options).not.toHaveProperty("storage");
    expect(firstBody.options).not.toHaveProperty("transport");
  });

  it("lets the MCP transport handle OPTIONS without token verification", async () => {
    const { handleMcpRequest } = await import("@/server/mcp/handler");

    const response = await handleMcpRequest(
      new Request("https://open-seo.test/mcp", { method: "OPTIONS" }),
      {
        AUTH_MODE: "hosted",
      },
      ctx,
    );
    const body = transportOptionsSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(verifyMocks.verifyJwsAccessToken).not.toHaveBeenCalled();
    expect(body.options.authContext).toBeUndefined();
  });

  it("returns 401 when Better Auth rejects the access token", async () => {
    const { handleMcpRequest } = await import("@/server/mcp/handler");
    verifyMocks.verifyJwsAccessToken.mockRejectedValue(
      new Error("invalid audience"),
    );

    const response = await handleMcpRequest(
      createMcpRequest(jwtShapedToken),
      {
        AUTH_MODE: "hosted",
      },
      ctx,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toBe(
      'Bearer resource_metadata="https://open-seo.test/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it("returns 403 when the verified token is missing MCP organization context", async () => {
    const { handleMcpRequest } = await import("@/server/mcp/handler");
    verifyMocks.verifyJwsAccessToken.mockResolvedValue(
      createAccessTokenPayload({
        [organizationIdClaim]: undefined,
      }),
    );

    const response = await handleMcpRequest(
      createMcpRequest(jwtShapedToken),
      {
        AUTH_MODE: "hosted",
      },
      ctx,
    );

    expect(response.status).toBe(403);
  });

  it("returns 401 when the token is missing the required mcp scope", async () => {
    const { handleMcpRequest } = await import("@/server/mcp/handler");
    verifyMocks.verifyJwsAccessToken.mockResolvedValue(
      createAccessTokenPayload({ scope: "offline_access" }),
    );

    const response = await handleMcpRequest(
      createMcpRequest(jwtShapedToken),
      {
        AUTH_MODE: "hosted",
      },
      ctx,
    );

    expect(response.status).toBe(401);
  });
});
