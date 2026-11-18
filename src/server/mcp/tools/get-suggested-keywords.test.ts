import { beforeEach, describe, expect, it, vi } from "vitest";
import { KeywordSuggestionReason } from "@/shared/keyword-suggestions";
import { getSuggestedKeywordsTool } from "./get-suggested-keywords";
import { makeToolContext, textContent } from "./tool-test-support";

const { getProjectForOrganization, getSuggestions } = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getSuggestions: vi.fn(),
}));

vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: { getProjectForOrganization },
}));
vi.mock("@/server/features/keywords/services/KeywordSuggestionService", () => ({
  KeywordSuggestionService: { getSuggestions },
}));

describe("get_suggested_keywords", () => {
  beforeEach(() => {
    getProjectForOrganization.mockResolvedValue({
      id: "project_1",
      domain: "harborviewjeep.com",
    });
    getSuggestions.mockResolvedValue({
      suggestions: [],
      canGenerate: false,
      searchConsoleConnected: true,
    });
  });

  it("lists suggestions as research_keywords seeds", async () => {
    getSuggestions.mockResolvedValue({
      suggestions: [
        {
          keyword: "jeep lease",
          reason: KeywordSuggestionReason.CloseToTopThree,
        },
      ],
      canGenerate: false,
      searchConsoleConnected: true,
    });

    const result = await getSuggestedKeywordsTool.handler(
      { projectId: "project_1" },
      makeToolContext(),
    );

    expect(textContent(result)).toContain("to research_keywords as seeds");
    expect(textContent(result)).toContain("jeep lease");
    expect(result.structuredContent).toMatchObject({
      suggestions: [
        {
          keyword: "jeep lease",
          reason: KeywordSuggestionReason.CloseToTopThree,
        },
      ],
    });
  });

  it("points a project without topics at website research", async () => {
    getSuggestions.mockResolvedValue({
      suggestions: [],
      canGenerate: true,
      searchConsoleConnected: true,
    });

    const result = await getSuggestedKeywordsTool.handler(
      { projectId: "project_1" },
      makeToolContext(),
    );

    expect(textContent(result)).toContain(
      "research_project_website with the project's website",
    );
  });

  it("links to connecting Search Console when it isn't connected", async () => {
    getSuggestions.mockResolvedValue({
      suggestions: [],
      canGenerate: false,
      searchConsoleConnected: false,
    });

    const result = await getSuggestedKeywordsTool.handler(
      { projectId: "project_1" },
      makeToolContext(),
    );

    expect(textContent(result)).toContain(
      "Search Console isn't connected; once the user connects it at https://open-seo.test/p/project_1/search-performance",
    );
  });
});
