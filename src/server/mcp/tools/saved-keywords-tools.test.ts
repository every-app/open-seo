import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listSavedKeywordsTool } from "./list-saved-keywords";
import { saveKeywordsTool } from "./save-keywords";
import { makeToolContext } from "./tool-test-support";

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

  it("passes tags through save_keywords", async () => {
    mocks.saveKeywords.mockResolvedValue({
      success: true,
      savedKeywordIds: ["saved_1"],
    });

    const result = await saveKeywordsTool.handler(
      {
        projectId: "project_1",
        keywords: ["technical seo"],
        tags: ["Content"],
      },
      toolContext,
    );

    expect(mocks.saveKeywords).toHaveBeenCalledWith({
      projectId: "project_1",
      keywords: ["technical seo"],
      tags: ["Content"],
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

  it("accepts and passes keyword metrics through save_keywords", async () => {
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
        monthlySearches: [
          { year: 2026, month: 7, searchVolume: 110 },
          { year: 2026, month: 8, searchVolume: 120 },
        ],
      },
    ];
    const args = z.object(saveKeywordsTool.config.inputSchema).parse({
      projectId: "project_1",
      keywords: ["technical seo"],
      metrics,
    });

    await saveKeywordsTool.handler(args, toolContext);

    expect(mocks.saveKeywords).toHaveBeenCalledWith({
      projectId: "project_1",
      keywords: ["technical seo"],
      metrics,
      tagMode: "append",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  it("replaces tags through save_keywords when requested", async () => {
    mocks.saveKeywords.mockResolvedValue({
      success: true,
      savedKeywordIds: ["saved_1", "saved_2"],
    });

    const result = await saveKeywordsTool.handler(
      {
        projectId: "project_1",
        keywords: ["semrush alternative", "semrush pricing"],
        tags: ["cluster: affordable semrush alternatives"],
        tagMode: "replace",
      },
      toolContext,
    );

    expect(mocks.saveKeywords).toHaveBeenCalledWith({
      projectId: "project_1",
      keywords: ["semrush alternative", "semrush pricing"],
      tags: ["cluster: affordable semrush alternatives"],
      tagMode: "replace",
      locationCode: 2840,
      languageCode: "en",
    });
    expect(result.structuredContent).toMatchObject({
      savedCount: 2,
      tags: ["cluster: affordable semrush alternatives"],
      tagMode: "replace",
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
      rows: [{ keyword: "technical seo" }],
    });
    const [content] = result.content;
    expect(content).toMatchObject({ type: "text" });
    expect(content?.type === "text" ? content.text : "").toContain(
      "tags:Content",
    );
  });
});
