import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createWorkersOAuthMcpProps } from "@/server/mcp/context";
import { handleAuthenticatedOpenSeoMcpRequest } from "@/server/mcp/transport";

vi.mock("@/lib/auth", () => ({
  getHostedBaseUrl: () => "https://open-seo.test",
}));

// The hosted transport re-checks membership per request; mocking the
// repository keeps this test off `cloudflare:workers`-backed db imports.
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: {
    getMembership: vi.fn(async () => ({ role: "owner" })),
  },
}));

vi.mock("@/middleware/ensure-user/cloudflareAccess", () => ({
  resolveCloudflareAccessContext: vi.fn(),
}));

vi.mock("@/middleware/ensure-user/delegated", () => ({
  resolveLocalNoAuthContext: vi.fn(),
}));

vi.mock("@/server/mcp/server", async () => {
  const { McpServer: ActualMcpServer } =
    await import("@modelcontextprotocol/server");
  return {
    createOpenSeoMcpServer: () => {
      const server = new ActualMcpServer({ name: "test", version: "1.0.0" });
      server.registerTool("ping", {}, () => ({
        content: [{ type: "text" as const, text: "pong" }],
      }));
      return server;
    },
  };
});

const ctx: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
};

function request(
  method: string,
  body?: unknown,
  headers?: Record<string, string>,
) {
  return new Request("https://open-seo.test/mcp", {
    method,
    headers: {
      Host: "open-seo.test",
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("Agents SDK v2 MCP transport", () => {
  it("rejects a standalone GET without constructing a server", async () => {
    let serverCount = 0;
    const handler = createMcpHandler(
      () => {
        serverCount += 1;
        const server = new McpServer({ name: "test", version: "1.0.0" });
        server.registerTool("ping", {}, () => ({
          content: [{ type: "text", text: "pong" }],
        }));
        return server;
      },
      { route: "/mcp" },
    );

    const response = await handler(request("GET"), {}, ctx);

    expect(response.status).toBe(405);
    expect(serverCount).toBe(0);
  });

  it("passes verified provider identity and application props to tools", async () => {
    const props = { openSeoAuth: { organizationId: "org-1" } };
    const oauthContext = {
      ...ctx,
      props,
      [Symbol.for("cloudflare.workers-oauth-provider.verified-context.v1")]: {
        version: 1,
        token: "access-token",
        clientId: "client-1",
        scopes: ["mcp"],
        resource: "https://open-seo.test/mcp",
        props,
      },
    } as ExecutionContext;
    const handler = createMcpHandler(
      () => {
        const server = new McpServer({ name: "test", version: "1.0.0" });
        server.registerTool(
          "auth",
          { inputSchema: z.object({}) },
          (_args, context) => ({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  clientId: context.http?.authInfo?.clientId,
                  scopes: context.http?.authInfo?.scopes,
                  props: getMcpAuthContext()?.props,
                }),
              },
            ],
          }),
        );
        return server;
      },
      { route: "/mcp" },
    );

    const response = await handler(
      request("POST", {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "auth", arguments: {} },
      }),
      {},
      oauthContext,
    );

    expect(response.status).toBe(200);
    const responseText = await response.text();
    expect(responseText).toContain('\\"clientId\\":\\"client-1\\"');
    expect(responseText).toContain('\\"scopes\\":[\\"mcp\\"]');
    expect(responseText).toContain('\\"organizationId\\":\\"org-1\\"');
  });

  it("accepts the SurfMind extension origin and rejects other browser origins", async () => {
    const handler = createMcpHandler(
      () => new McpServer({ name: "test", version: "1.0.0" }),
      {
        route: "/mcp",
        allowedOriginHostnames: [
          "open-seo.test",
          "pghallcbnfabbgfijhbcldaapmgidnaa",
        ],
      },
    );
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    };

    const surfMindResponse = await handler(
      request("POST", body, {
        Origin: "chrome-extension://pghallcbnfabbgfijhbcldaapmgidnaa",
      }),
      {},
      ctx,
    );
    const unrelatedOriginResponse = await handler(
      request("POST", body, { Origin: "https://evil.com" }),
      {},
      ctx,
    );

    expect(surfMindResponse.status).toBe(200);
    expect(unrelatedOriginResponse.status).toBe(403);
  });

  it("enforces exact hosted origins around the real SDK handler", async () => {
    const props = createWorkersOAuthMcpProps({
      userId: "user-1",
      userEmail: "user@example.com",
      organizationId: "org-1",
      baseUrl: "https://open-seo.test",
      clientId: "client-1",
      scopes: ["mcp"],
    });
    const modernToolsList = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    };
    const call = (origin?: string) =>
      handleAuthenticatedOpenSeoMcpRequest(
        request("POST", modernToolsList, {
          "Mcp-Method": "tools/list",
          ...(origin ? { Origin: origin } : {}),
        }),
        props,
        {},
        { ...ctx, props },
      );

    await expect(
      call("chrome-extension://pghallcbnfabbgfijhbcldaapmgidnaa"),
    ).resolves.toMatchObject({ status: 200 });
    await expect(call("https://open-seo.test")).resolves.toMatchObject({
      status: 200,
    });
    await expect(call()).resolves.toMatchObject({ status: 200 });
    await expect(
      call("https://pghallcbnfabbgfijhbcldaapmgidnaa"),
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      call("chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    ).resolves.toMatchObject({ status: 403 });
  });
});
