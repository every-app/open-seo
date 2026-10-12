import { beforeEach, describe, expect, it, vi } from "vitest";
import { objectSchema } from "@/server/mcp/output-schemas";
import * as researchTools from "./dataforseo-research-tools";
import * as localSeoTools from "./local-seo-tools";
import { getBacklinksProfileTool } from "./get-backlinks-profile";
import { getSearchConsolePerformanceTool } from "./search-console-tools";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  profileBacklinksPage: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: {},
  DurableObject: class {
    readonly ctx = null;
  },
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

vi.mock("@/server/features/backlinks/services/BacklinksService", () => ({
  BacklinksService: {
    profileBacklinksPage: mocks.profileBacklinksPage,
  },
}));

// A class instance reproduces what the DataForSEO SDK hands the tools: an
// object whose prototype is not Object.prototype (e.g.
// DataforseoLabsSerpCompetitorsLiveItem). Zod 4's z.record() rejects those
// ("expected record, received <ClassName>"), so a record-based output schema
// makes the MCP server fail these passthrough tools with a -32602 output
// validation error even though the API call succeeded.
class ProviderRow {
  constructor(
    public domain: string,
    public rank_absolute: number,
  ) {}
}

const toolContext = makeToolContext({
  userEmail: "team@example.com",
  baseUrl: "https://app.example.com",
});

const backlinkPage = {
  rows: [
    {
      domainFrom: "source.example",
      urlFrom: "https://source.example/post",
      urlTo: "https://example.com/",
      anchor: "Example",
      itemType: "content",
      isDofollow: true,
      relAttributes: ["noopener"],
      rank: 77,
      domainFromRank: 65,
      pageFromRank: 54,
      spamScore: 3,
      firstSeen: "2026-01-01",
      lastSeen: "2026-03-01",
      isLost: false,
      isBroken: false,
      linksCount: 1,
    },
  ],
  totalCount: 450,
  hasMore: true,
  page: 2,
  pageSize: 50,
  fetchedAt: "2026-06-25T00:00:00.000Z",
};

beforeEach(() => {
  mocks.getProjectForOrganization.mockResolvedValue({
    id: "project_123",
    locationCode: 2840,
    languageCode: "en",
  });
});

const providerRows = (field: string) => ({
  [field]: [new ProviderRow("example.com", 1)],
  totalCount: 1,
  // Required by the queued business-data tools; ignored by the rest.
  status: "completed",
  taskId: "google:task-1",
});

describe("DataForSEO research tool output schemas", () => {
  // Every tool that streams provider rows or objects straight to
  // structuredContent.
  it.each([
    ["find_serp_competitors", providerRows("competitors")],
    ["get_local_serp_results", providerRows("results")],
    ["search_local_businesses", providerRows("businesses")],
    ["get_google_business_questions", providerRows("questions")],
    ["get_ranked_keywords", providerRows("keywords")],
    ["get_business_reviews", providerRows("reviews")],
    ["get_business_updates", providerRows("updates")],
    ["get_business_profile", { profile: new ProviderRow("example.com", 1) }],
  ])(
    "%s accepts typed (non-plain-object) provider rows",
    async (toolName, payload) => {
      const tools = { ...researchTools, ...localSeoTools };
      const tool = Object.values(tools).find((t) => t.name === toolName);
      if (!tool) throw new Error(`tool ${toolName} not found`);

      // Mirror the MCP server: validate structuredContent against the tool's
      // own output schema. Extra keys (e.g. get_ranked_keywords' totalCount)
      // are allowed by the passthrough schemas, so one payload covers all.
      const result = await objectSchema(
        tool.config.outputSchema,
      ).safeParseAsync(payload);

      expect(result.success).toBe(true);
    },
  );
});

describe("MCP output schemas with expected missing fields", () => {
  // Google omits position for the discover and googleNews search types.
  it("accepts Search Console rows without a position", async () => {
    const schema = objectSchema(
      getSearchConsolePerformanceTool.config.outputSchema,
    );

    const result = await schema.safeParseAsync({
      ok: true,
      rows: [{ clicks: 0, impressions: 1, ctr: 0 }],
    });

    expect(result.success).toBe(true);
  });
});

describe("get_backlinks_profile MCP tool", () => {
  it("returns paginated backlink rows and honors filters, sorting, and mode", async () => {
    mocks.profileBacklinksPage.mockResolvedValue(backlinkPage);

    const result = await getBacklinksProfileTool.handler(
      {
        projectId: "project_123",
        target: "example.com",
        scope: "domain",
        page: 2,
        pageSize: 50,
        sortField: "spamScore",
        sortOrder: "asc",
        filters: {
          include: "blog",
          linkType: "nofollow",
          hideLost: true,
        },
        mode: "as_is",
        hideSpam: false,
      },
      toolContext,
    );

    expect(mocks.profileBacklinksPage).toHaveBeenCalledWith(
      {
        target: "example.com",
        scope: "domain",
        page: 2,
        pageSize: 50,
        sortField: "spamScore",
        sortOrder: "asc",
        filters: {
          include: "blog",
          linkType: "nofollow",
          hideLost: true,
        },
        mode: "as_is",
      },
      {
        userId: "user_123",
        userEmail: "team@example.com",
        organizationId: "org_123",
        projectId: "project_123",
      },
      { hideSpam: false },
    );
    expect(result.structuredContent?.backlinks).toEqual(backlinkPage);
    const first = result.content[0];
    expect(first.type === "text" && first.text).toContain("- has more: yes");
  });
});
