import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { ToolExtra } from "@/server/mcp/context";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getConfigById: vi.fn(),
  getConfigsForProject: vi.fn(),
  getKeywordsForConfig: vi.fn(),
  addKeywords: vi.fn(),
  removeKeywords: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

vi.mock(
  "@/server/features/rank-tracking/repositories/RankTrackingRepository",
  () => ({
    RankTrackingRepository: {
      getConfigById: mocks.getConfigById,
      getConfigsForProject: mocks.getConfigsForProject,
      getKeywordsForConfig: mocks.getKeywordsForConfig,
    },
  }),
);

vi.mock("@/server/features/rank-tracking/services/RankTrackingService", () => ({
  RankTrackingService: {
    addKeywords: mocks.addKeywords,
    removeKeywords: mocks.removeKeywords,
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

const config = {
  id: "config_1",
  projectId: "project_1",
  domain: "example.com",
  locationCode: 2840,
};

function text(result: { content?: Array<{ type: string; text?: string }> }) {
  const first = result.content?.[0];
  return first?.type === "text" ? (first.text ?? "") : "";
}

describe("rank tracking write MCP tools", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  describe("add_rank_tracking_keywords", () => {
    it("adds keywords through the service and reports duplicates", async () => {
      mocks.getConfigById.mockResolvedValue(config);
      mocks.getKeywordsForConfig.mockResolvedValue([
        { id: "kw_1", keyword: "seo tools" },
      ]);
      mocks.addKeywords.mockResolvedValue({ added: 1, addedIds: ["kw_2"] });
      const { addRankTrackingKeywordsTool } =
        await import("./rank-tracking-write-tools");

      const result = await addRankTrackingKeywordsTool.handler(
        {
          projectId: "project_1",
          trackerId: "config_1",
          keywords: ["  Free SEO Tools ", "SEO Tools"],
        },
        toolExtra,
      );

      expect(mocks.addKeywords).toHaveBeenCalledWith("config_1", "project_1", [
        "  Free SEO Tools ",
        "SEO Tools",
      ]);
      expect(result.structuredContent).toMatchObject({
        projectId: "project_1",
        trackerId: "config_1",
        added: 1,
        addedKeywords: ["free seo tools"],
        duplicateKeywords: ["seo tools"],
        skippedByLimit: 0,
      });
      expect(text(result)).toContain("Added 1 keyword(s)");
      expect(text(result)).toContain("Already tracked (1): seo tools");
    });

    it("resolves the tracker when the project has exactly one", async () => {
      mocks.getConfigsForProject.mockResolvedValue([config]);
      mocks.getKeywordsForConfig.mockResolvedValue([]);
      mocks.addKeywords.mockResolvedValue({ added: 1, addedIds: ["kw_1"] });
      const { addRankTrackingKeywordsTool } =
        await import("./rank-tracking-write-tools");

      const result = await addRankTrackingKeywordsTool.handler(
        { projectId: "project_1", keywords: ["seo tools"] },
        toolExtra,
      );

      expect(mocks.getConfigById).not.toHaveBeenCalled();
      expect(mocks.addKeywords).toHaveBeenCalledWith("config_1", "project_1", [
        "seo tools",
      ]);
      expect(result.structuredContent).toMatchObject({
        trackerId: "config_1",
        added: 1,
      });
    });

    it("requires trackerId when the project has several trackers", async () => {
      mocks.getConfigsForProject.mockResolvedValue([
        config,
        { ...config, id: "config_2", domain: "example.org" },
      ]);
      const { addRankTrackingKeywordsTool } =
        await import("./rank-tracking-write-tools");

      await expect(() =>
        addRankTrackingKeywordsTool.handler(
          { projectId: "project_1", keywords: ["seo tools"] },
          toolExtra,
        ),
      ).rejects.toThrow("pass trackerId");
      expect(mocks.addKeywords).not.toHaveBeenCalled();
    });

    it("rejects an unknown trackerId before writing", async () => {
      mocks.getConfigById.mockResolvedValue(null);
      const { addRankTrackingKeywordsTool } =
        await import("./rank-tracking-write-tools");

      await expect(() =>
        addRankTrackingKeywordsTool.handler(
          {
            projectId: "project_1",
            trackerId: "missing",
            keywords: ["seo tools"],
          },
          toolExtra,
        ),
      ).rejects.toThrow("not found");
      expect(mocks.addKeywords).not.toHaveBeenCalled();
    });

    it("reports keywords skipped by the per-tracker limit", async () => {
      mocks.getConfigById.mockResolvedValue(config);
      mocks.getKeywordsForConfig.mockResolvedValue([]);
      // Service hit the cap: only one of the two new keywords fit.
      mocks.addKeywords.mockResolvedValue({ added: 1, addedIds: ["kw_1"] });
      const { addRankTrackingKeywordsTool } =
        await import("./rank-tracking-write-tools");

      const result = await addRankTrackingKeywordsTool.handler(
        {
          projectId: "project_1",
          trackerId: "config_1",
          keywords: ["seo tools", "free seo tools"],
        },
        toolExtra,
      );

      expect(result.structuredContent).toMatchObject({
        added: 1,
        addedKeywords: ["seo tools"],
        skippedByLimit: 1,
      });
      expect(text(result)).toContain("Skipped 1 keyword(s)");
    });
  });

  describe("remove_rank_tracking_keywords", () => {
    it("maps keywords to tracking IDs and reports unmatched ones", async () => {
      mocks.getConfigById.mockResolvedValue(config);
      mocks.getKeywordsForConfig.mockResolvedValue([
        { id: "kw_1", keyword: "seo tools" },
        { id: "kw_2", keyword: "free seo tools" },
      ]);
      mocks.removeKeywords.mockResolvedValue(undefined);
      const { removeRankTrackingKeywordsTool } =
        await import("./rank-tracking-write-tools");

      const result = await removeRankTrackingKeywordsTool.handler(
        {
          projectId: "project_1",
          trackerId: "config_1",
          keywords: [" SEO Tools ", "unknown keyword"],
        },
        toolExtra,
      );

      expect(mocks.removeKeywords).toHaveBeenCalledWith(
        "config_1",
        "project_1",
        ["kw_1"],
      );
      expect(result.structuredContent).toMatchObject({
        projectId: "project_1",
        trackerId: "config_1",
        removed: 1,
        removedKeywords: ["seo tools"],
        notFoundKeywords: ["unknown keyword"],
      });
      expect(text(result)).toContain("Removed 1 keyword(s)");
      expect(text(result)).toContain("Not tracked (1): unknown keyword");
    });

    it("skips the service call when nothing matches", async () => {
      mocks.getConfigById.mockResolvedValue(config);
      mocks.getKeywordsForConfig.mockResolvedValue([
        { id: "kw_1", keyword: "seo tools" },
      ]);
      const { removeRankTrackingKeywordsTool } =
        await import("./rank-tracking-write-tools");

      const result = await removeRankTrackingKeywordsTool.handler(
        {
          projectId: "project_1",
          trackerId: "config_1",
          keywords: ["unknown keyword"],
        },
        toolExtra,
      );

      expect(mocks.removeKeywords).not.toHaveBeenCalled();
      expect(result.structuredContent).toMatchObject({
        removed: 0,
        notFoundKeywords: ["unknown keyword"],
      });
    });
  });
});
