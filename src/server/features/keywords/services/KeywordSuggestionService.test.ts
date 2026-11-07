import { beforeEach, describe, expect, it, vi } from "vitest";
import { GscNotConnectedError } from "@/server/lib/gscErrors";
import { KeywordSuggestionReason } from "@/shared/keyword-suggestions";

const {
  checkUsageCreditsDepleted,
  getPerformance,
  isHosted,
  listResearchKeywords,
  research,
  writeResearchKeywords,
} = vi.hoisted(() => ({
  checkUsageCreditsDepleted: vi.fn(),
  getPerformance: vi.fn(),
  isHosted: vi.fn(),
  listResearchKeywords: vi.fn(),
  research: vi.fn(),
  writeResearchKeywords: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));
vi.mock("@/db/runBatch", () => ({
  runBatch: (build: (tx: unknown) => unknown) => build({}),
}));
vi.mock("@/server/billing/subscription", () => ({
  checkUsageCreditsDepleted,
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: isHosted,
}));
vi.mock(
  "@/server/features/ai-visibility/repositories/AiVisibilityRepository",
  () => ({ AiVisibilityRepository: { listResearchKeywords } }),
);
vi.mock(
  "@/server/features/ai-visibility/repositories/aiVisibilityConfigurationRepository",
  () => ({ writeResearchKeywords }),
);
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: { getPerformance },
  GscNotConnectedError,
  isExpectedGrantFailure: () => false,
}));
vi.mock("@/server/features/projects/services/websiteResearch", () => ({
  researchWebsite: research,
}));

import { KeywordSuggestionService } from "./KeywordSuggestionService";

const project: Parameters<typeof KeywordSuggestionService.generate>[0] = {
  id: "project",
  organizationId: "organization",
  name: "Harborview Jeep",
  brandName: null,
  domain: "harborviewjeep.com",
  locationCode: 2840,
  languageCode: "en",
  createdAt: "2026-11-05 00:00:00",
  archivedAt: null,
  aiResearchKeywords: null,
  indexnowKey: null,
};
const customer = {
  organizationId: "organization",
  userId: "user",
  userEmail: "user@example.com",
};
const queryPage = (query: string, page: string, position: number) => ({
  keys: [query, page],
  clicks: 0,
  impressions: 100,
  ctr: 0,
  position,
});

describe("KeywordSuggestionService.getSuggestions", () => {
  beforeEach(() => {
    listResearchKeywords.mockResolvedValue([]);
    getPerformance.mockRejectedValue(new GscNotConnectedError("project"));
  });

  it("suggests short searches near the top 3 and page 1, then the site's short topics", async () => {
    getPerformance.mockResolvedValue({
      rows: [
        queryPage("jeep wrangler lease", "/wrangler", 12),
        queryPage("jeep wrangler lease", "/lease", 18),
        queryPage("jeep lease", "/lease", 5),
        // Already in the top 3 through its best page.
        queryPage("jeep dealer", "/", 2),
        queryPage("jeep dealer", "/about", 6),
        // Too far down page 1 to be close to the top 3.
        queryPage("jeep parts", "/parts", 8),
        queryPage("how much to lease a jeep wrangler", "/wrangler", 14),
      ],
    });
    listResearchKeywords.mockResolvedValue([
      "Jeep Wrangler Lease",
      "Used Jeep Wrangler",
      "jeep lease deals near me",
    ]);

    expect(await KeywordSuggestionService.getSuggestions(project)).toEqual({
      suggestions: [
        {
          keyword: "jeep lease",
          reason: KeywordSuggestionReason.CloseToTopThree,
        },
        {
          keyword: "jeep wrangler lease",
          reason: KeywordSuggestionReason.CloseToPageOne,
        },
        {
          keyword: "used jeep wrangler",
          reason: KeywordSuggestionReason.FromYourSite,
        },
      ],
      canGenerate: false,
      searchConsoleConnected: true,
    });
  });

  it("offers generation to a project with a website but no topics", async () => {
    expect(await KeywordSuggestionService.getSuggestions(project)).toEqual({
      suggestions: [],
      canGenerate: true,
      searchConsoleConnected: false,
    });
  });
});

describe("KeywordSuggestionService.generate", () => {
  beforeEach(() => {
    listResearchKeywords.mockResolvedValue([]);
    isHosted.mockResolvedValue(true);
    checkUsageCreditsDepleted.mockResolvedValue({ depleted: false });
    research.mockResolvedValue({
      suggestedTopics: [{ name: "jeep lease", prompts: [] }],
      suggestedKeywords: ["used jeep wrangler"],
    });
  });

  it("saves the researched topics without researching competitors", async () => {
    await KeywordSuggestionService.generate(project, customer);

    expect(research).toHaveBeenCalledWith(
      "harborviewjeep.com",
      project,
      { ...customer, projectId: "project" },
      { skipCompetitors: true },
    );
    expect(writeResearchKeywords).toHaveBeenCalledWith({}, "project", [
      "jeep lease",
      "used jeep wrangler",
    ]);
  });

  it("does not research without credits", async () => {
    checkUsageCreditsDepleted.mockResolvedValue({ depleted: true });

    await expect(
      KeywordSuggestionService.generate(project, customer),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });
    expect(research).not.toHaveBeenCalled();
  });

  it("does not research again once the project has topics", async () => {
    listResearchKeywords.mockResolvedValue(["jeep lease"]);

    await KeywordSuggestionService.generate(project, customer);

    expect(research).not.toHaveBeenCalled();
  });
});
