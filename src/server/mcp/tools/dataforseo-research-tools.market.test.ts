import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { ToolExtra } from "@/server/mcp/context";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

// Market resolution for get_ranked_keywords: the explicit country selector and
// the project's default-market fallback (projects.locationCode/languageCode).
// find_serp_competitors resolves through the same resolveMarketSelector.

const mocks = vi.hoisted(() => ({
  createDataforseoClient: vi.fn(),
  getProjectForOrganization: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: mocks.createDataforseoClient,
  fetchKeywordMetricsForList: vi.fn(),
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

function setProject(market: { locationCode: number; languageCode: string }) {
  mocks.getProjectForOrganization.mockResolvedValue({
    id: "project_1",
    name: "Test",
    domain: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...market,
  });
}

type MarketArgs = {
  market?: { country: "US" };
  locationCode?: number;
  languageCode?: string;
};

async function runRankedKeywords(args: MarketArgs) {
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

async function runSerpCompetitors(args: MarketArgs) {
  const serpCompetitors = vi.fn().mockResolvedValue([]);
  mocks.createDataforseoClient.mockReturnValue({
    labs: { serpCompetitors },
  });
  const { findSerpCompetitorsTool } =
    await import("./dataforseo-research-tools");
  await findSerpCompetitorsTool.handler(
    { projectId: "project_1", keywords: ["seo"], ...args },
    toolExtra,
  );
  return serpCompetitors;
}

describe("market resolution for Labs tools", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createDataforseoClient.mockReset();
    mocks.getProjectForOrganization.mockReset();
    setProject({ locationCode: 2840, languageCode: "en" });
  });

  it("keeps the US when market is explicit even for a non-US project", async () => {
    setProject({ locationCode: 2704, languageCode: "vi" });
    const rankedKeywords = await runRankedKeywords({
      market: { country: "US" },
    });
    expect(rankedKeywords).toHaveBeenCalledWith(
      expect.objectContaining({ locationCode: 2840, languageCode: "en" }),
    );
  });

  it("exposes explicit location and language selectors on both tool schemas", async () => {
    const { findSerpCompetitorsTool, getRankedKeywordsTool } =
      await import("./dataforseo-research-tools");

    expect(getRankedKeywordsTool.config.inputSchema.locationCode).toBeDefined();
    expect(getRankedKeywordsTool.config.inputSchema.languageCode).toBeDefined();
    expect(
      findSerpCompetitorsTool.config.inputSchema.locationCode,
    ).toBeDefined();
    expect(
      findSerpCompetitorsTool.config.inputSchema.languageCode,
    ).toBeDefined();
  });

  it("passes an explicit non-US market to both Labs tools", async () => {
    setProject({ locationCode: 2704, languageCode: "vi" });

    const rankedKeywords = await runRankedKeywords({
      locationCode: 2756,
      languageCode: "de",
    });
    expect(rankedKeywords).toHaveBeenCalledWith(
      expect.objectContaining({ locationCode: 2756, languageCode: "de" }),
    );

    const serpCompetitors = await runSerpCompetitors({
      locationCode: 2756,
      languageCode: "de",
    });
    expect(serpCompetitors).toHaveBeenCalledWith(
      expect.objectContaining({ locationCode: 2756, languageCode: "de" }),
    );
  });

  it("uses the selected location's default language when only locationCode is explicit", async () => {
    setProject({ locationCode: 2704, languageCode: "vi" });
    const rankedKeywords = await runRankedKeywords({ locationCode: 2276 });
    expect(rankedKeywords).toHaveBeenCalledWith(
      expect.objectContaining({ locationCode: 2276, languageCode: "de" }),
    );
  });

  it("prefers an explicit locationCode over the legacy market object", async () => {
    setProject({ locationCode: 2704, languageCode: "vi" });
    const rankedKeywords = await runRankedKeywords({
      locationCode: 2756,
      languageCode: "de",
      market: { country: "US" },
    });
    expect(rankedKeywords).toHaveBeenCalledWith(
      expect.objectContaining({ locationCode: 2756, languageCode: "de" }),
    );
  });

  it("accepts a non-default language the location serves", async () => {
    setProject({ locationCode: 2704, languageCode: "vi" });
    // Switzerland serves fr/de/it; de is the default.
    const serpCompetitors = await runSerpCompetitors({
      locationCode: 2756,
      languageCode: "fr",
    });
    expect(serpCompetitors).toHaveBeenCalledWith(
      expect.objectContaining({ locationCode: 2756, languageCode: "fr" }),
    );
  });

  it("rejects a language the location does not serve", async () => {
    setProject({ locationCode: 2704, languageCode: "vi" });
    await expect(
      runRankedKeywords({ locationCode: 2276, languageCode: "fr" }),
    ).rejects.toThrow("is not available for this location");
  });

  it("rejects an explicit non-Labs country before making a paid call", async () => {
    await expect(
      runRankedKeywords({ locationCode: 2352, languageCode: "is" }),
    ).rejects.toThrow("Domain analytics is not available for this country");
  });

  it("follows the project's default market when the market object is omitted", async () => {
    setProject({ locationCode: 2704, languageCode: "vi" });
    const rankedKeywords = await runRankedKeywords({});
    expect(rankedKeywords).toHaveBeenCalledWith(
      expect.objectContaining({ locationCode: 2704, languageCode: "vi" }),
    );
  });

  it("falls back to the US when the project market is not Labs-served", async () => {
    // Iceland (2352) is served from Google Ads data; the Labs-only market
    // tools must not inherit it.
    setProject({ locationCode: 2352, languageCode: "en" });
    const rankedKeywords = await runRankedKeywords({});
    expect(rankedKeywords).toHaveBeenCalledWith(
      expect.objectContaining({ locationCode: 2840, languageCode: "en" }),
    );
  });
});
