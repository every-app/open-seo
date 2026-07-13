import type { CreateMcpHandlerOptions } from "agents/mcp";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const selfHostedAuthMocks = vi.hoisted(() => ({
  resolveCloudflareAccessContext: vi.fn(),
  resolveLocalNoAuthContext: vi.fn(),
}));

const serverMocks = vi.hoisted(() => ({
  nextServerId: 0,
  serverIds: new WeakMap<McpServer, number>(),
  lastServer: undefined as McpServer | undefined,
}));

vi.mock("@/middleware/ensure-user/cloudflareAccess", () => ({
  resolveCloudflareAccessContext:
    selfHostedAuthMocks.resolveCloudflareAccessContext,
}));

vi.mock("@/middleware/ensure-user/delegated", () => ({
  resolveLocalNoAuthContext: selfHostedAuthMocks.resolveLocalNoAuthContext,
}));

vi.mock("@/server/mcp/server", () => ({
  registerOpenSeoMcpTools: vi.fn(),
}));

vi.mock("agents/mcp", () => ({
  createMcpHandler: (_server: McpServer, options: CreateMcpHandlerOptions) => {
    serverMocks.nextServerId += 1;
    serverMocks.serverIds.set(_server, serverMocks.nextServerId);
    serverMocks.lastServer = _server;

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

function createMcpRequest() {
  return new Request("https://open-seo.test/mcp", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }),
  });
}

describe("handleSelfHostedOpenSeoMcpRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverMocks.nextServerId = 0;
    serverMocks.serverIds = new WeakMap<McpServer, number>();
    serverMocks.lastServer = undefined;
    selfHostedAuthMocks.resolveLocalNoAuthContext.mockResolvedValue({
      userId: "local-admin",
      userEmail: "admin@localhost",
      organizationId: "delegated-local-admin",
    });
    selfHostedAuthMocks.resolveCloudflareAccessContext.mockResolvedValue({
      userId: "cloudflare-user",
      userEmail: "person@example.com",
      organizationId: "delegated-cloudflare-user",
    });
  });

  it("accepts local no-auth MCP requests with the local admin context", async () => {
    const { handleSelfHostedOpenSeoMcpRequest } =
      await import("@/server/mcp/transport");

    const response = await handleSelfHostedOpenSeoMcpRequest(
      createMcpRequest(),
      "local_noauth",
      {},
      ctx,
    );
    const body = transportOptionsSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(selfHostedAuthMocks.resolveLocalNoAuthContext).toHaveBeenCalled();
    expect(
      body.options.authContext?.props[MCP_AUTH_CONTEXT_PROP],
    ).toMatchObject({
      userId: "local-admin",
      userEmail: "admin@localhost",
      organizationId: "delegated-local-admin",
      clientId: null,
      scopes: [],
      audience: "https://open-seo.test/mcp",
      subject: "local-admin",
      baseUrl: "https://open-seo.test",
    });
  });

  it("accepts Cloudflare Access MCP requests through the existing Access resolver", async () => {
    const { handleSelfHostedOpenSeoMcpRequest } =
      await import("@/server/mcp/transport");

    const response = await handleSelfHostedOpenSeoMcpRequest(
      createMcpRequest(),
      "cloudflare_access",
      {},
      ctx,
    );
    const body = transportOptionsSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(
      selfHostedAuthMocks.resolveCloudflareAccessContext,
    ).toHaveBeenCalledWith(expect.any(Headers));
    expect(
      body.options.authContext?.props[MCP_AUTH_CONTEXT_PROP],
    ).toMatchObject({
      userId: "cloudflare-user",
      userEmail: "person@example.com",
      organizationId: "delegated-cloudflare-user",
      clientId: null,
      scopes: [],
      audience: "https://open-seo.test/mcp",
      subject: "cloudflare-user",
      baseUrl: "https://open-seo.test",
    });
  });

  // The OOM came from the GET SSE stream pinning a per-request McpServer, so
  // GET must 405 without ever building one.
  it("returns 405 for the standalone GET SSE stream without building a server", async () => {
    const { handleSelfHostedOpenSeoMcpRequest } =
      await import("@/server/mcp/transport");

    const response = await handleSelfHostedOpenSeoMcpRequest(
      new Request("https://open-seo.test/mcp", {
        method: "GET",
        headers: { Accept: "text/event-stream" },
      }),
      "local_noauth",
      {},
      ctx,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toContain("POST");
    // nextServerId only advances when a server is built — a GET must not.
    expect(serverMocks.nextServerId).toBe(0);
  });

  it("lets the MCP transport handle OPTIONS without auth context", async () => {
    const { handleSelfHostedOpenSeoMcpRequest } =
      await import("@/server/mcp/transport");

    const response = await handleSelfHostedOpenSeoMcpRequest(
      new Request("https://open-seo.test/mcp", { method: "OPTIONS" }),
      "cloudflare_access",
      {},
      ctx,
    );
    const body = transportOptionsSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(
      selfHostedAuthMocks.resolveCloudflareAccessContext,
    ).not.toHaveBeenCalled();
    expect(body.options.authContext).toBeUndefined();
  });

  // Directory scanners (e.g. Smithery) read server metadata from initialize.
  it("serves directory metadata in the initialize response", async () => {
    const { handleSelfHostedOpenSeoMcpRequest } =
      await import("@/server/mcp/transport");

    await handleSelfHostedOpenSeoMcpRequest(
      createMcpRequest(),
      "local_noauth",
      {},
      ctx,
    );
    const server = serverMocks.lastServer;
    if (!server) throw new Error("MCP server was not created");

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ]);

    const serverInfo = client.getServerVersion();
    expect(serverInfo).toMatchObject({
      name: "OpenSEO MCP",
      title: "OpenSEO",
      websiteUrl: "https://openseo.so",
      icons: [
        {
          src: "https://openseo.so/android-chrome-512x512.png",
          mimeType: "image/png",
          sizes: ["512x512"],
        },
      ],
    });
    expect(serverInfo?.description).toContain(
      "SEO research tools for AI agents",
    );

    await client.close();
  });
});
