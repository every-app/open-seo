import {
  normalizeObjectSchema,
  safeParseAsync,
} from "@modelcontextprotocol/sdk/server/zod-compat.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { ToolExtra } from "@/server/mcp/context";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  profileBacklinksPage: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: {},
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

const authContext = {
  userId: "user_123",
  userEmail: "team@example.com",
  organizationId: "org_123",
  clientId: "client_123",
  scopes: ["mcp"],
  audience: "open-seo",
  subject: "user_123",
  baseUrl: "https://app.example.com",
};

const authExtra: ToolExtra = {
  signal: new AbortController().signal,
  requestId: 1,
  sendNotification: vi.fn(),
  sendRequest: vi.fn(),
  authInfo: {
    token: "token",
    clientId: "client_123",
    scopes: ["mcp"],
    resource: new URL("https://app.example.com/mcp"),
    extra: {
      [MCP_AUTH_CONTEXT_PROP]: authContext,
    },
  } satisfies AuthInfo,
};

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
  mocks.getProjectForOrganization.mockReset();
  mocks.profileBacklinksPage.mockReset();
  mocks.getProjectForOrganization.mockResolvedValue({
    id: "project_123",
    locationCode: 2840,
    languageCode: "en",
  });
});

describe("DataForSEO research tool output schemas", () => {
  // Every tool that streams provider rows straight to structuredContent.
  it.each([
    ["find_serp_competitors", "competitors"],
    ["get_local_serp_results", "results"],
    ["search_local_businesses", "businesses"],
    ["get_google_business_questions", "questions"],
    ["get_ranked_keywords", "keywords"],
  ])(
    "%s accepts typed (non-plain-object) provider rows",
    async (toolName, field) => {
      const tools = await import("./dataforseo-research-tools");
      const tool = Object.values(tools).find((t) => t.name === toolName);
      if (!tool) throw new Error(`tool ${toolName} not found`);

      const schema = normalizeObjectSchema(tool.config.outputSchema);
      if (!schema) throw new Error("output schema did not normalize");

      // Mirror the MCP server: validate structuredContent against the tool's
      // own output schema. Extra keys (e.g. get_ranked_keywords' totalCount)
      // are allowed by the passthrough schemas, so one payload covers all.
      const result = await safeParseAsync(schema, {
        [field]: [new ProviderRow("example.com", 1)],
        totalCount: 1,
      });

      expect(result.success).toBe(true);
    },
  );

  it("get_backlinks_profile accepts a paginated backlinks profile payload", async () => {
    const { getBacklinksProfileTool } = await import("./get-backlinks-profile");
    const schema = normalizeObjectSchema(
      getBacklinksProfileTool.config.outputSchema,
    );
    if (!schema) throw new Error("output schema did not normalize");

    const result = await safeParseAsync(schema, {
      backlinks: backlinkPage,
      meta: {
        organizationId: "org_123",
        projectId: "project_123",
        url: "https://app.example.com/p/project_123/backlinks",
      },
    });

    expect(result.success).toBe(true);
  });
});

describe("get_backlinks_profile MCP tool", () => {
  it("returns paginated backlink rows and honors filters, sorting, and mode", async () => {
    mocks.profileBacklinksPage.mockResolvedValue(backlinkPage);
    const { getBacklinksProfileTool } = await import("./get-backlinks-profile");

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
      authExtra,
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

  it("passes through final-page pagination state", async () => {
    const finalPage = {
      ...backlinkPage,
      totalCount: 51,
      hasMore: false,
      page: 2,
    };
    mocks.profileBacklinksPage.mockResolvedValue(finalPage);
    const { getBacklinksProfileTool } = await import("./get-backlinks-profile");

    const result = await getBacklinksProfileTool.handler(
      {
        projectId: "project_123",
        target: "example.com",
        scope: "domain",
        page: 2,
        pageSize: 50,
        sortField: "rank",
        sortOrder: "desc",
        filters: {},
        mode: "one_per_domain",
        hideSpam: true,
      },
      authExtra,
    );

    expect(result.structuredContent?.backlinks).toMatchObject({
      totalCount: 51,
      hasMore: false,
      page: 2,
      pageSize: 50,
    });
  });

  it("preserves Backlinks API access and credit errors", async () => {
    const { AppError } = await import("@/server/lib/errors");
    const error = new AppError(
      "BACKLINKS_BILLING_ISSUE",
      "The connected DataForSEO account has a billing or balance issue",
    );
    mocks.profileBacklinksPage.mockRejectedValue(error);
    const { getBacklinksProfileTool } = await import("./get-backlinks-profile");

    await expect(
      getBacklinksProfileTool.handler(
        {
          projectId: "project_123",
          target: "example.com",
          scope: "domain",
          page: 1,
          pageSize: 100,
          sortField: "rank",
          sortOrder: "desc",
          filters: {},
          mode: "one_per_domain",
          hideSpam: true,
        },
        authExtra,
      ),
    ).rejects.toMatchObject({
      code: "BACKLINKS_BILLING_ISSUE",
      message:
        "The connected DataForSEO account has a billing or balance issue",
    });
  });
});
