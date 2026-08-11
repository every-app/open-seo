import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const ctx: ExecutionContext = {
  waitUntil() {},
  passThroughOnException() {},
  props: {},
};

function request(method: string, body?: unknown) {
  return new Request("https://open-seo.test/mcp", {
    method,
    headers: {
      Host: "open-seo.test",
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
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
});
