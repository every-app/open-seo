import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { addRankTrackingKeywordsTool } from "./add-rank-tracking-keywords";
import { createRankTrackerTool } from "./create-rank-tracker";
import { deleteRankTrackerTool } from "./delete-rank-tracker";
import { getRankTrackerTool } from "./get-rank-tracker";
import { runRankTrackerTool } from "./run-rank-tracker";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  createConfig: vi.fn(),
  getTracker: vi.fn(),
  addKeywords: vi.fn(),
  deleteTracker: vi.fn(),
  triggerCheck: vi.fn(),
  captureServerEvent: vi.fn(),
  waitUntil: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: {},
  waitUntil: mocks.waitUntil,
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/rank-tracking/services/RankTrackingService", () => ({
  RankTrackingService: {
    createConfig: mocks.createConfig,
    getTracker: mocks.getTracker,
    addKeywords: mocks.addKeywords,
    deleteTracker: mocks.deleteTracker,
    triggerCheck: mocks.triggerCheck,
  },
}));
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));

const projectId = "11111111-1111-4111-8111-111111111111";
const trackerId = "22222222-2222-4222-8222-222222222222";
const keywordId = "33333333-3333-4333-8333-333333333333";

const toolContext = makeToolContext();

const createdConfig = {
  id: trackerId,
  domain: "openseo.so",
  devices: "mobile",
  scheduleInterval: "manual",
};

describe("rank tracking management MCP tools", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({
      id: projectId,
      domain: "openseo.so",
      locationCode: 2840,
      languageCode: "en",
    });
    mocks.captureServerEvent.mockResolvedValue(undefined);
  });

  it("creates a manual tracker from project defaults without spending credits", async () => {
    mocks.createConfig.mockResolvedValue(createdConfig);

    const parsed = z.object(createRankTrackerTool.config.inputSchema).parse({
      projectId,
    });
    const result = await createRankTrackerTool.handler(parsed, toolContext);

    expect(mocks.createConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: "openseo.so",
        devices: "mobile",
        serpDepth: 40,
        scheduleInterval: "manual",
      }),
    );
    expect(textContent(result)).toContain("no check was started");
    expect(result.structuredContent).toMatchObject({
      trackerId,
      config: createdConfig,
    });
    expect(mocks.captureServerEvent).toHaveBeenCalledWith({
      distinctId: "user_123",
      event: "rank_tracking:config_create",
      organizationId: "org_123",
      properties: {
        project_id: projectId,
        domain: "openseo.so",
        devices: "mobile",
        schedule: "manual",
        source: "mcp",
      },
    });
  });

  it("returns the live Google SERP link in both the text and the structured rows", async () => {
    mocks.getTracker.mockResolvedValue({
      config: {
        ...createdConfig,
        serpDepth: 40,
        locationCode: 2276,
        languageCode: "de",
        locationName: null,
      },
      results: { rows: [{ keyword: "seo tool" }], run: null },
    });

    const result = await getRankTrackerTool.handler(
      { projectId, trackerId },
      toolContext,
    );

    const url = "https://www.google.com/search?q=seo+tool&hl=de&gl=de&pws=0";
    expect(textContent(result)).toContain(url);
    expect(result.structuredContent).toMatchObject({
      results: { rows: [{ googleSerpUrl: url }] },
    });
  });

  it("requires maxCostCredits to run a rank tracker", () => {
    expect(
      z.object(runRankTrackerTool.config.inputSchema).safeParse({
        projectId,
        trackerId,
      }).success,
    ).toBe(false);
  });

  it("adds keywords under the credit-ceiling approval and reports the confirmed count", async () => {
    mocks.addKeywords.mockResolvedValue({ added: 1, addedIds: [keywordId] });

    const added = await addRankTrackingKeywordsTool.handler(
      {
        projectId,
        trackerId,
        keywords: ["seo", "SEO", "existing"],
        matchCase: true,
      },
      toolContext,
    );
    expect(textContent(added)).toContain("Added 1 of 3 requested");
    expect(added.structuredContent).toMatchObject({ requested: 3, added: 1 });
    expect(mocks.addKeywords).toHaveBeenCalledWith(
      trackerId,
      projectId,
      ["seo", "SEO", "existing"],
      {
        kind: "credit_ceiling",
        maxEstimatedScheduledCheckCredits: undefined,
      },
      true,
    );
  });

  it("deletes a tracker and reports what was removed", async () => {
    mocks.deleteTracker.mockResolvedValue({
      config: { ...createdConfig, locationName: "Ellensburg, Washington" },
      keywordCount: 4,
    });

    const result = await deleteRankTrackerTool.handler(
      { projectId, trackerId },
      toolContext,
    );

    expect(mocks.deleteTracker).toHaveBeenCalledWith(trackerId, projectId);
    expect(textContent(result)).toContain(
      `Deleted rank tracker ${trackerId} (openseo.so, Ellensburg, Washington)`,
    );
    expect(textContent(result)).toContain("4 tracked keywords");
    expect(result.structuredContent).toMatchObject({
      trackerId,
      domain: "openseo.so",
      locationName: "Ellensburg, Washington",
      keywordsDeleted: 4,
    });
  });

  it("returns the created run ID and emits the telemetry contract, but not for an already-running tracker", async () => {
    mocks.triggerCheck.mockResolvedValue({ ok: true, runId: "run_1" });
    const started = await runRankTrackerTool.handler(
      { projectId, trackerId, maxCostCredits: 13 },
      toolContext,
    );

    expect(started.structuredContent).toMatchObject({
      started: true,
      runId: "run_1",
    });
    expect(mocks.triggerCheck).toHaveBeenCalledWith(
      expect.objectContaining({ maxCostCredits: 13 }),
    );
    expect(mocks.captureServerEvent).toHaveBeenCalledWith({
      distinctId: "user_123",
      event: "rank_tracking:check_trigger",
      organizationId: "org_123",
      properties: {
        project_id: projectId,
        config_id: trackerId,
        run_id: "run_1",
        source: "mcp",
      },
    });
    expect(mocks.waitUntil).toHaveBeenCalledTimes(1);

    mocks.triggerCheck.mockResolvedValue({
      ok: false,
      reason: "already_running",
      blockingRunId: "run_0",
    });
    const blocked = await runRankTrackerTool.handler(
      { projectId, trackerId, maxCostCredits: 13 },
      toolContext,
    );

    expect(textContent(blocked)).toContain("no additional check was charged");
    expect(blocked.structuredContent).toMatchObject({
      started: false,
      blockingRunId: "run_0",
    });
    expect(mocks.captureServerEvent).toHaveBeenCalledTimes(1);
  });
});
