import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExtra } from "@/server/mcp/context";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProviderStatusSummary: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/provider-status", () => ({
  getProviderStatusSummary: mocks.getProviderStatusSummary,
}));

const authContext = {
  userId: "user_123",
  userEmail: "alice@example.com",
  organizationId: "org_123",
  clientId: "client_123",
  scopes: ["mcp"],
  audience: "https://open-seo.test/mcp",
  subject: "user_123",
  baseUrl: "https://open-seo.test",
};

const toolExtra: ToolExtra = {
  signal: new AbortController().signal,
  requestId: 1,
  sendNotification: vi.fn(),
  sendRequest: vi.fn(),
  authInfo: {
    token: "token",
    clientId: "client_123",
    scopes: ["mcp"],
    resource: new URL("https://open-seo.test/mcp"),
    extra: { [MCP_AUTH_CONTEXT_PROP]: authContext },
  } satisfies AuthInfo,
};

describe("get_provider_status MCP tool", () => {
  beforeEach(() => {
    mocks.getProviderStatusSummary.mockReset();
    mocks.getProviderStatusSummary.mockResolvedValue({
      mode: "self-hosted",
      providers: [
        {
          provider: "dataforseo",
          kind: "paid",
          configured: false,
          enabled: false,
          reason: "DataForSEO is disabled by default for this self-hosted deployment.",
          budgetUsd: 0,
          hasApiKey: false,
        },
        {
          provider: "google_search_console",
          kind: "first_party",
          configured: false,
          enabled: false,
          reason:
            "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and BETTER_AUTH_SECRET to enable Search Console OAuth.",
        },
        {
          provider: "site_audit",
          kind: "local",
          configured: true,
          enabled: true,
          reason: null,
        },
      ],
    });
  });

  it("returns structured provider status without secrets", async () => {
    const { getProviderStatusTool } = await import("./get-provider-status");

    const result = await getProviderStatusTool.handler({}, toolExtra);

    expect(result.structuredContent).toMatchObject({
      mode: "self-hosted",
      providers: [
        {
          provider: "dataforseo",
          configured: false,
          enabled: false,
          budgetUsd: 0,
          hasApiKey: false,
        },
        {
          provider: "google_search_console",
          configured: false,
          enabled: false,
        },
        {
          provider: "site_audit",
          configured: true,
          enabled: true,
        },
      ],
    });

    const first = result.content[0];
    expect(first.type).toBe("text");
    expect(first.type === "text" && first.text).toContain("Mode: self-hosted");
    expect(first.type === "text" && first.text).toContain("dataforseo: not configured, disabled, budget 0.00 USD");
    expect(first.type === "text" && first.text).not.toContain("token");
  });
});
