import { beforeEach, describe, expect, it, vi } from "vitest";
import { researchKeywordsTool } from "./research-keywords";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  research: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: { getMembership: vi.fn() },
}));
vi.mock("@/server/features/keywords/services/KeywordResearchService", () => ({
  KeywordResearchService: { research: mocks.research },
}));

describe("research_keywords", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      locationCode: 2840,
      languageCode: "en",
    });
  });

  it("returns metric rows without the monthly trend array", async () => {
    mocks.research.mockResolvedValue({
      source: "labs",
      usedFallback: false,
      rows: [
        {
          keyword: "seo mcp",
          searchVolume: 320,
          keywordDifficulty: 12,
          cpc: 4.1,
          competition: 0.2,
          intent: "commercial",
          trend: [{ year: 2026, month: 8, searchVolume: 300 }],
        },
      ],
    });

    const result = await researchKeywordsTool.handler(
      { projectId: "project_1", seeds: [{ seed: "seo mcp" }] },
      makeToolContext(),
    );

    expect(result.structuredContent?.results).toEqual([
      {
        seed: "seo mcp",
        ok: true,
        rowCount: 1,
        source: "labs",
        usedFallback: false,
        rows: [
          {
            keyword: "seo mcp",
            searchVolume: 320,
            keywordDifficulty: 12,
            cpc: 4.1,
            competition: 0.2,
            intent: "commercial",
          },
        ],
      },
    ]);
  });
});
