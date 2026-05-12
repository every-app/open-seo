import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addTagsToSavedKeywords: vi.fn(),
  listSavedKeywordsByProject: vi.fn(),
  removeAllTagsFromSavedKeywords: vi.fn(),
  removeSavedKeywords: vi.fn(),
  removeTagsFromSavedKeywords: vi.fn(),
  replaceTagsForSavedKeywords: vi.fn(),
  saveKeywordsToProject: vi.fn(),
  upsertKeywordMetric: vi.fn(),
}));

vi.mock(
  "@/server/features/keywords/repositories/KeywordResearchRepository",
  () => ({
    KeywordResearchRepository: mocks,
  }),
);

const savedKeywordRow = {
  id: "saved_1",
  projectId: "project_1",
  keyword: "technical seo",
  locationCode: 2840,
  languageCode: "en",
  createdAt: "2026-05-11T00:00:00.000Z",
};

describe("saved keyword service", () => {
  beforeEach(() => {
    vi.resetModules();
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("attaches tags to saved keyword rows after saving", async () => {
    mocks.saveKeywordsToProject.mockResolvedValue([
      savedKeywordRow,
      { ...savedKeywordRow, id: "saved_2", keyword: "content seo" },
    ]);
    mocks.addTagsToSavedKeywords.mockResolvedValue({
      savedKeywordCount: 2,
      tags: [],
    });
    const { saveKeywords } = await import("./saved-keywords");

    await saveKeywords({
      projectId: "project_1",
      keywords: [" Technical SEO ", "technical seo", "Content SEO"],
      locationCode: 2840,
      languageCode: "en",
      tagMode: "append",
      tags: ["Content", "BOFU"],
    });

    expect(mocks.saveKeywordsToProject).toHaveBeenCalledWith({
      projectId: "project_1",
      keywords: ["technical seo", "content seo"],
      locationCode: 2840,
      languageCode: "en",
    });
    expect(mocks.addTagsToSavedKeywords).toHaveBeenCalledWith({
      projectId: "project_1",
      savedKeywordIds: ["saved_1", "saved_2"],
      tagNames: ["Content", "BOFU"],
    });
  });

  it("does not call tag assignment when no tags are provided", async () => {
    mocks.saveKeywordsToProject.mockResolvedValue([savedKeywordRow]);
    const { saveKeywords } = await import("./saved-keywords");

    await saveKeywords({
      projectId: "project_1",
      keywords: ["technical seo"],
      locationCode: 2840,
      languageCode: "en",
      tagMode: "append",
    });

    expect(mocks.addTagsToSavedKeywords).not.toHaveBeenCalled();
  });

  it("maps paged saved keyword rows with attached tags", async () => {
    mocks.listSavedKeywordsByProject.mockResolvedValue({
      totalCount: 1,
      tags: [
        {
          id: "tag_1",
          projectId: "project_1",
          name: "Content",
          normalizedName: "content",
          color: null,
          createdAt: "2026-05-11T00:00:00.000Z",
          keywordCount: 1,
        },
      ],
      rows: [
        {
          row: savedKeywordRow,
          metric: {
            id: 1,
            projectId: "project_1",
            keyword: "technical seo",
            locationCode: 2840,
            languageCode: "en",
            searchVolume: 120,
            cpc: 2.5,
            competition: 0.2,
            keywordDifficulty: 18,
            intent: "informational",
            monthlySearches: null,
            fetchedAt: "2026-05-10T00:00:00.000Z",
          },
          tags: [
            {
              id: "tag_1",
              projectId: "project_1",
              name: "Content",
              normalizedName: "content",
              color: null,
              createdAt: "2026-05-11T00:00:00.000Z",
            },
          ],
        },
      ],
    });
    const { getSavedKeywords } = await import("./saved-keywords");

    const result = await getSavedKeywords({
      projectId: "project_1",
      tagIds: ["tag_1"],
      page: 1,
      pageSize: 50,
      sort: "createdAt",
      order: "desc",
    });

    expect(mocks.listSavedKeywordsByProject).toHaveBeenCalledWith({
      projectId: "project_1",
      search: undefined,
      tagIds: ["tag_1"],
      tagNames: undefined,
      page: 1,
      pageSize: 50,
      sort: "createdAt",
      order: "desc",
    });
    expect(result.rows[0]?.tags).toEqual([
      { id: "tag_1", name: "Content", normalizedName: "content", color: null },
    ]);
    expect(result.tags).toEqual([
      {
        id: "tag_1",
        name: "Content",
        normalizedName: "content",
        color: null,
        keywordCount: 1,
      },
    ]);
  });

  it("updates saved keyword tags through add and remove operations", async () => {
    mocks.addTagsToSavedKeywords.mockResolvedValue({
      savedKeywordCount: 2,
      tags: [
        {
          id: "tag_1",
          name: "Content",
          normalizedName: "content",
        },
      ],
    });
    mocks.removeTagsFromSavedKeywords.mockResolvedValue({
      savedKeywordCount: 2,
      removedCount: 2,
      tags: [{ id: "tag_2" }],
    });
    const { updateSavedKeywordTags } = await import("./saved-keywords");

    const result = await updateSavedKeywordTags({
      projectId: "project_1",
      savedKeywordIds: ["saved_1", "saved_2"],
      addTags: ["Content"],
      removeTagIds: ["tag_2"],
    });

    expect(result).toMatchObject({
      success: true,
      taggedCount: 2,
      addedTags: [
        {
          id: "tag_1",
          name: "Content",
          normalizedName: "content",
          color: null,
        },
      ],
      removedTagIds: ["tag_2"],
      removedAssignments: 2,
    });
  });

  it("replaces tags only for the exact saved keyword rows returned by save", async () => {
    mocks.saveKeywordsToProject.mockResolvedValue([
      { ...savedKeywordRow, id: "saved_us", keyword: "technical seo" },
    ]);
    mocks.replaceTagsForSavedKeywords.mockResolvedValue({
      savedKeywordCount: 1,
      removedCount: 1,
      tags: [{ id: "tag_new", name: "US", normalizedName: "us" }],
    });
    const { saveKeywords } = await import("./saved-keywords");

    const result = await saveKeywords({
      projectId: "project_1",
      keywords: ["technical seo"],
      locationCode: 2840,
      languageCode: "en",
      tags: ["US"],
      tagMode: "replace",
    });

    expect(mocks.replaceTagsForSavedKeywords).toHaveBeenCalledWith({
      projectId: "project_1",
      savedKeywordIds: ["saved_us"],
      tagNames: ["US"],
    });
    expect(mocks.addTagsToSavedKeywords).not.toHaveBeenCalled();
    expect(result.savedKeywordIds).toEqual(["saved_us"]);
  });

  it("rejects replace mode without replacement tags", async () => {
    mocks.saveKeywordsToProject.mockResolvedValue([savedKeywordRow]);
    const { saveKeywords } = await import("./saved-keywords");

    await expect(
      saveKeywords({
        projectId: "project_1",
        keywords: ["technical seo"],
        locationCode: 2840,
        languageCode: "en",
        tagMode: "replace",
      }),
    ).rejects.toThrow("Replacement tags are required");
    expect(mocks.replaceTagsForSavedKeywords).not.toHaveBeenCalled();
  });
});
