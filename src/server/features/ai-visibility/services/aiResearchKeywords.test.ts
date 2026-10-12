import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listCompetitors,
  listResearchKeywords,
  research,
  workflow,
  prepareWebsiteTracking,
  startWebsiteTrackingRun,
} = vi.hoisted(() => ({
  listCompetitors: vi.fn(),
  listResearchKeywords: vi.fn(),
  research: vi.fn(),
  workflow: { get: vi.fn(), create: vi.fn() },
  prepareWebsiteTracking: vi.fn(),
  startWebsiteTrackingRun: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: { AI_VISIBILITY_WORKFLOW: workflow },
}));

vi.mock("@/db/runBatch", () => ({ runBatch: vi.fn() }));
vi.mock("@/server/billing/subscription", () => ({
  checkUsageCreditsDepleted: vi.fn(),
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: async () => false,
}));
vi.mock("../repositories/aiVisibilityConfigurationRepository", () => ({
  writeConfiguration: vi.fn(),
  writeResearchKeywords: vi.fn(),
}));
vi.mock("./websiteTrackingSetup", () => ({
  prepareWebsiteTracking,
  startWebsiteTrackingRun,
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: {
    getProjectForOrganization: async () => ({
      id: "project",
      name: "OpenSEO",
      domain: "openseo.so",
      locationCode: 2840,
      languageCode: "en",
    }),
  },
}));
vi.mock(
  "@/server/features/project-context/repositories/ProjectContextRepository",
  () => ({
    ProjectContextRepository: {
      listSections: async () => [
        { key: "business_overview", content: "SEO tools." },
      ],
      listCompetitors,
    },
  }),
);
vi.mock("../repositories/AiVisibilityRepository", () => ({
  AiVisibilityRepository: { listResearchKeywords },
}));
vi.mock("@/server/features/projects/services/websiteResearch", () => ({
  researchWebsite: research,
}));

import {
  getAiResearchSetup,
  runAiResearchSetup,
  startAiResearchSetup,
} from "./aiResearchKeywords";
import { customer } from "./aiVisibilityTestFixtures";

const topic = (name: string) => ({ name, prompts: [] });

describe("runAiResearchSetup", () => {
  beforeEach(() => {
    listResearchKeywords.mockResolvedValue([]);
    listCompetitors.mockResolvedValue([]);
    prepareWebsiteTracking.mockResolvedValue(null);
    research.mockResolvedValue({
      name: "OpenSEO",
      domain: "openseo.so",
      overview: "SEO tools.",
      competitors: [
        {
          name: "Ahrefs",
          domain: "ahrefs.com",
          notes: "SEO suite.",
          sourceUrl: "https://ahrefs.com/",
        },
      ],
      suggestedTopics: ["rank tracker", "seo tool"].map(topic),
      suggestedKeywords: [],
    });
  });

  it("does nothing when keywords were saved meanwhile", async () => {
    listResearchKeywords.mockResolvedValue(["rank tracker"]);

    await expect(
      runAiResearchSetup({ projectId: "project" }, customer),
    ).resolves.toEqual({ review: null });
    expect(research).not.toHaveBeenCalled();
  });

  it("runs newly seeded tracking once only for in-app setup", async () => {
    listCompetitors.mockResolvedValue([{ domain: "ahrefs.com" }]);
    prepareWebsiteTracking.mockResolvedValue({ prompts: [] });

    await runAiResearchSetup({ projectId: "project" }, customer);
    expect(startWebsiteTrackingRun).not.toHaveBeenCalled();

    await runAiResearchSetup({ projectId: "project" }, customer, {
      runSeededTracking: true,
    });
    expect(startWebsiteTrackingRun).toHaveBeenCalledWith("project", customer);
  });

  it("returns website research for competitor review when competitors are missing", async () => {
    const result = await runAiResearchSetup({ projectId: "project" }, customer);

    expect(result).toMatchObject({
      review: { competitors: [{ domain: "ahrefs.com" }] },
    });
  });
});

describe("getAiResearchSetup", () => {
  it.each([
    [
      "AppError: We couldn't read this website. Check the URL and try again.",
      "website_unreadable",
    ],
    ["Error: connect ECONNREFUSED 10.0.0.5:5432", null],
  ])("surfaces only a known failure cause for %s", async (message, failure) => {
    listResearchKeywords.mockResolvedValue([]);
    listCompetitors.mockResolvedValue([]);
    workflow.get.mockResolvedValue({
      status: async () => ({
        status: "errored",
        error: { name: "Error", message },
      }),
    });

    const setup = await getAiResearchSetup("project");

    expect(setup).toMatchObject({ status: "failed", failure });
    expect(JSON.stringify(setup)).not.toContain(message);
  });
});

describe("startAiResearchSetup", () => {
  it("does not start a second paid run while one is running, such as after a reload", async () => {
    listResearchKeywords.mockResolvedValue([]);
    listCompetitors.mockResolvedValue([]);
    workflow.get.mockResolvedValue({
      status: async () => ({ status: "running" }),
      restart: vi.fn(),
    });

    await expect(
      startAiResearchSetup({ projectId: "project" }, customer),
    ).resolves.toMatchObject({ status: "running" });
    expect(workflow.create).not.toHaveBeenCalled();
  });

  it("starts one workflow per project with serializable billing fields only", async () => {
    listResearchKeywords.mockResolvedValue([]);
    listCompetitors.mockResolvedValue([]);
    workflow.get.mockRejectedValue(new Error("not found"));

    await startAiResearchSetup(
      { projectId: "project" },
      // A request context also carries objects a workflow cannot serialize.
      { ...customer, project: { id: "project" } } as typeof customer,
    );

    expect(workflow.create).toHaveBeenCalledWith({
      id: "ai-research-setup-project",
      params: {
        setupProjectId: "project",
        runSeededTracking: false,
        customer: { ...customer, projectId: "project" },
      },
    });
  });
});
