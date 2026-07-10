import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { ToolExtra } from "@/server/mcp/context";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

// Market resolution for the Labs-only tools (get_ranked_keywords,
// find_serp_competitors): the explicit country selector and the server's
// default-market fallback.

const mocks = vi.hoisted(() => ({
  createDataforseoClient: vi.fn(),
  getProjectForOrganization: vi.fn(),
  getDefaultMarket: vi.fn(async () => ({
    locationCode: 2840,
    languageCode: "en",
    label: "United States",
  })),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: mocks.createDataforseoClient,
  fetchKeywordMetricsForList: vi.fn(),
}));

vi.mock("@/server/lib/market-defaults", () => ({
  getDefaultMarket: mocks.getDefaultMarket,
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
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

async function runRankedKeywords(args: { market?: { country: "US" } }) {
  const rankedKeywords = vi.fn().mockResolvedValue({
    items: [],
    totalCount: 0,
  });
  mocks.createDataforseoClient.mockReturnValue({
    domain: { rankedKeywords },
  });
  const { getRankedKeywordsTool } = await import("./dataforseo-research-tools");
  await getRankedKeywordsTool.handler(
    { projectId: "project_1", target: "acmeexample.com", ...args },
    toolExtra,
  );
  return rankedKeywords;
}

describe("market resolution for Labs tools", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createDataforseoClient.mockReset();
    mocks.getProjectForOrganization.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
    mocks.getDefaultMarket.mockResolvedValue({
      locationCode: 2840,
      languageCode: "en",
      label: "United States",
    });
  });

  it("keeps the US when market is explicit even under a non-US default", async () => {
    mocks.getDefaultMarket.mockResolvedValue({
      locationCode: 2704,
      languageCode: "vi",
      label: "Vietnam",
    });
    const rankedKeywords = await runRankedKeywords({
      market: { country: "US" },
    });
    expect(rankedKeywords).toHaveBeenCalledWith(
      expect.objectContaining({ locationCode: 2840, languageCode: "en" }),
    );
  });

  it("follows the server's default market when the market object is omitted", async () => {
    mocks.getDefaultMarket.mockResolvedValue({
      locationCode: 2704,
      languageCode: "vi",
      label: "Vietnam",
    });
    const rankedKeywords = await runRankedKeywords({});
    expect(rankedKeywords).toHaveBeenCalledWith(
      expect.objectContaining({ locationCode: 2704, languageCode: "vi" }),
    );
  });

  it("falls back to the US when the default market is not Labs-served", async () => {
    // Iceland (2352) is served from Google Ads data; the Labs-only market
    // tools must not inherit it.
    mocks.getDefaultMarket.mockResolvedValue({
      locationCode: 2352,
      languageCode: "en",
      label: "Iceland",
    });
    const rankedKeywords = await runRankedKeywords({});
    expect(rankedKeywords).toHaveBeenCalledWith(
      expect.objectContaining({ locationCode: 2840, languageCode: "en" }),
    );
  });
});
