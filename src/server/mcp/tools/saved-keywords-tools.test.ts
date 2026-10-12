import { beforeEach, describe, expect, it, vi } from "vitest";
import { listSavedKeywordsTool } from "./list-saved-keywords";
import { saveKeywordsTool } from "./save-keywords";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getSavedKeywords: vi.fn(),
  saveKeywords: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));

// project-auth imports the repository for user-scoped (API key) credentials;
// unused here (pinned context) but keeps the db out of the module graph.
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: { getMembership: vi.fn() },
}));

vi.mock("@/server/features/keywords/services/KeywordResearchService", () => ({
  KeywordResearchService: {
    getSavedKeywords: mocks.getSavedKeywords,
    saveKeywords: mocks.saveKeywords,
  },
}));

const toolContext = makeToolContext();

describe("saved keyword MCP tools", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  // Appending is the default: a replace default would silently wipe the
  // user's existing tags on every save.
  it("passes tags and metrics through save_keywords, appending tags by default", async () => {
    mocks.saveKeywords.mockResolvedValue({
      success: true,
      savedKeywordIds: ["saved_1"],
    });
    const metrics = [
      {
        keyword: "technical seo",
        searchVolume: 120,
        keywordDifficulty: 18,
        cpc: 2.5,
        competition: 0.42,
        intent: "commercial" as const,
        monthlySearches: [{ year: 2026, month: 8, searchVolume: 120 }],
      },
    ];

    const result = await saveKeywordsTool.handler(
      {
        projectId: "project_1",
        keywords: ["technical seo"],
        tags: ["Content"],
        metrics,
      },
      toolContext,
    );

    expect(mocks.saveKeywords).toHaveBeenCalledWith({
      projectId: "project_1",
      keywords: ["technical seo"],
      tags: ["Content"],
      metrics,
      tagMode: "append",
      locationCode: 2840,
      languageCode: "en",
    });
    expect(result.structuredContent).toMatchObject({
      savedCount: 1,
      tags: ["Content"],
      tagMode: "append",
    });
  });

  it("rejects replace mode without replacement tags before saving", async () => {
    await expect(() =>
      saveKeywordsTool.handler(
        {
          projectId: "project_1",
          keywords: ["semrush alternative"],
          tagMode: "replace",
        },
        toolContext,
      ),
    ).rejects.toThrow("Replacement tags are required");
    expect(mocks.saveKeywords).not.toHaveBeenCalled();
  });

  it("filters list_saved_keywords by search and tag names", async () => {
    mocks.getSavedKeywords.mockResolvedValue({
      totalCount: 1,
      tags: [
        {
          id: "tag_1",
          name: "Content",
          normalizedName: "content",
          keywordCount: 1,
        },
      ],
      rows: [
        {
          id: "saved_1",
          keyword: "technical seo",
          searchVolume: 120,
          keywordDifficulty: 18,
          cpc: 2.5,
          tags: [{ id: "tag_1", name: "Content", normalizedName: "content" }],
        },
      ],
    });

    const result = await listSavedKeywordsTool.handler(
      {
        projectId: "project_1",
        search: "technical",
        tags: ["Content"],
        limit: 50,
      },
      toolContext,
    );

    expect(mocks.getSavedKeywords).toHaveBeenCalledWith({
      projectId: "project_1",
      search: "technical",
      tagNames: ["Content"],
      page: 1,
      pageSize: 50,
      sort: "createdAt",
      order: "desc",
    });
    expect(result.structuredContent).toMatchObject({
      totalCount: 1,
      rows: [{ keyword: "technical seo", tags: ["Content"] }],
      tags: [{ name: "Content", keywordCount: 1 }],
    });
    // remove_saved_keywords takes these ids, so both channels must carry them.
    expect(result.structuredContent?.rows?.[0]).toHaveProperty("id", "saved_1");
    expect(textContent(result)).toContain("id:saved_1");
  });
});
