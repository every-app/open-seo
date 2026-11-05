import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it, vi } from "vitest";
import { createWorkersOAuthMcpProps } from "./context";
import { createOpenSeoMcpServer } from "./server";

const captureServerEvent = vi.hoisted(() => vi.fn());

vi.mock("cloudflare:workers", () => ({
  env: {},
  waitUntil: (promise: Promise<unknown>) => void promise,
  DurableObject: class {
    readonly ctx = null;
  },
}));

vi.mock("@/server/lib/posthog", () => ({ captureServerEvent }));

vi.mock("@/server/lib/self-host-telemetry", () => ({
  incrementSelfHostMcpToolCallCount: vi.fn(),
}));

async function connectClient() {
  const server = createOpenSeoMcpServer(
    createWorkersOAuthMcpProps({
      userId: "user_test",
      userEmail: "test@example.com",
      organizationId: "org_test",
      role: "owner",
      baseUrl: "https://open-seo.test",
      clientId: "client_test",
      scopes: ["mcp"],
    }),
  );
  const client = new Client({ name: "input-rejection", version: "1" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

describe("MCP tool input the SDK rejects", () => {
  it.each([
    {
      tool: "research_keywords",
      args: {
        projectId: "project_test",
        seeds: [
          { seed: "keyword", locationCode: "secret-location-a" },
          { seed: "keyword", locationCode: "secret-location-b" },
        ],
        resultLimit: 100,
      },
      fields: ["seeds.*.locationCode", "resultLimit"],
    },
    {
      tool: "update_project_context",
      args: {
        projectId: "project_test",
        updates: [{ "secret-key": "secret-value" }],
      },
      fields: ["updates.*"],
    },
  ])(
    "reports $tool by field path, without what the caller sent",
    async ({ tool, args, fields }) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const client = await connectClient();

      const result = await client.callTool({ name: tool, arguments: args });

      expect(result.isError).toBe(true);
      expect(captureServerEvent).toHaveBeenCalledTimes(1);
      expect(captureServerEvent.mock.calls[0][0]).toMatchObject({
        distinctId: "user_test",
        organizationId: "org_test",
        event: "mcp:tool_call",
        properties: {
          tool,
          success: false,
          error_code: "INPUT_VALIDATION",
          client_id: "client_test",
          invalid_fields: fields,
        },
      });
      const reported = [...warn.mock.calls, ...captureServerEvent.mock.calls];
      expect(JSON.stringify(reported)).not.toContain("secret");
      warn.mockRestore();
    },
  );
});
