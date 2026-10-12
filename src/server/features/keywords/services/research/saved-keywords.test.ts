import { describe, expect, it, vi } from "vitest";
import { saveKeywords } from "./saved-keywords";

const mocks = vi.hoisted(() => ({
  addTagsToSavedKeywords: vi.fn(),
  replaceTagsForSavedKeywords: vi.fn(),
  saveKeywordsToProject: vi.fn(),
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
  it("attaches tags to saved keyword rows after saving", async () => {
    mocks.saveKeywordsToProject.mockResolvedValue([
      savedKeywordRow,
      { ...savedKeywordRow, id: "saved_2", keyword: "content seo" },
    ]);
    mocks.addTagsToSavedKeywords.mockResolvedValue({
      savedKeywordCount: 2,
      tags: [],
    });

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

  it("replaces tags only for the exact saved keyword rows returned by save", async () => {
    mocks.saveKeywordsToProject.mockResolvedValue([
      { ...savedKeywordRow, id: "saved_us", keyword: "technical seo" },
    ]);
    mocks.replaceTagsForSavedKeywords.mockResolvedValue({
      savedKeywordCount: 1,
      removedCount: 1,
      tags: [{ id: "tag_new", name: "US", normalizedName: "us" }],
    });

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
