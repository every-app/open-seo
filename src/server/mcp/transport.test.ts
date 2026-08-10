import type { CreateMcpHandlerOptions } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  createWorkersOAuthMcpProps,
  MCP_AUTH_CONTEXT_PROP,
} from "@/server/mcp/context";

const selfHostedAuthMocks = vi.hoisted(() => ({
  resolveCloudflareAccessContext: vi.fn(),
  resolveLocalNoAuthContext: vi.fn(),
}));

vi.mock("@/middleware/ensure-user/cloudflareAccess", () => ({
  resolveCloudflareAccessContext:
    selfHostedAuthMocks.resolveCloudflareAccessContext,
}));

vi.mock("@/middleware/ensure-user/delegated", () => ({
  resolveLocalNoAuthContext: selfHostedAuthMocks.resolveLocalNoAuthContext,
}));

vi.mock("@/lib/auth", () => ({
  getHostedBaseUrl: () => "https://open-seo.test",
}));

vi.mock("@/server/mcp/server", () => ({
  createOpenSeoMcpServer: () =>
    new McpServer({
      name: "OpenSEO MCP",
      title: "OpenSEO",
      version: "0.0.11",
      description: "SEO research tools for AI agents",
      websiteUrl: "https://openseo.so",
      icons: [
        {
          src: "https://openseo.so/android-chrome-512x512.png",
          mimeType: "image/png",
          sizes: ["512x512"],
        },
      ],
    }),
}));

vi.mock("agents/mcp/server", () => ({
  createMcpHandler: (
    createServer: () => McpServer,
    options: CreateMcpHandlerOptions,
  ) => {
    return async (request: Request) => {
      if (request.method !== "OPTIONS") createServer();

      return new Response(
        JSON.stringify({
          options,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };
  },
}));

const ctx: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
};

const transportOptionsSchema = z.object({
  options: z.object({
    route: z.string().optional(),
    allowedOriginHostnames: z.array(z.string()).optional(),
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
      baseUrl: "https://open-seo.test",
    });
    // Self-hosted must not pin Origins to the request's own Host — the
    // handler's localhost-class default is the rebinding-safe choice.
    expect(body.options.allowedOriginHostnames).toBeUndefined();
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
      baseUrl: "https://open-seo.test",
    });
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
});

describe("handleAuthenticatedOpenSeoMcpRequest", () => {
  it("accepts the provider's encrypted identity and MCP scope fallback", async () => {
    const { handleAuthenticatedOpenSeoMcpRequest } =
      await import("@/server/mcp/transport");
    const props = createWorkersOAuthMcpProps({
      userId: "user-1",
      userEmail: "user@example.com",
      organizationId: "org-1",
      baseUrl: "https://open-seo.test",
      clientId: "client-1",
      scopes: ["mcp"],
    });

    const response = await handleAuthenticatedOpenSeoMcpRequest(
      createMcpRequest(),
      props,
      {},
      { ...ctx, props },
    );

    expect(response.status).toBe(200);
    const body = transportOptionsSchema.parse(await response.json());
    expect(body.options.allowedOriginHostnames).toEqual(["open-seo.test"]);
  });

  it("rejects provider props missing the OAuth client identity", async () => {
    const { handleAuthenticatedOpenSeoMcpRequest } =
      await import("@/server/mcp/transport");
    // Hosted tokens always carry clientId/scopes; a token without them must
    // fail closed rather than skip scope enforcement.
    const props = createWorkersOAuthMcpProps({
      userId: "user-1",
      userEmail: "user@example.com",
      organizationId: "org-1",
      baseUrl: "https://open-seo.test",
    });

    const response = await handleAuthenticatedOpenSeoMcpRequest(
      createMcpRequest(),
      props,
      {},
      { ...ctx, props },
    );

    expect(response.status).toBe(403);
  });

  it("rejects an OAuth client without the MCP scope", async () => {
    const { handleAuthenticatedOpenSeoMcpRequest } =
      await import("@/server/mcp/transport");
    const props = createWorkersOAuthMcpProps({
      userId: "user-1",
      userEmail: "user@example.com",
      organizationId: "org-1",
      baseUrl: "https://open-seo.test",
      clientId: "client-1",
      scopes: ["offline_access"],
    });

    const response = await handleAuthenticatedOpenSeoMcpRequest(
      createMcpRequest(),
      props,
      {},
      { ...ctx, props },
    );

    expect(response.status).toBe(403);
  });
});
