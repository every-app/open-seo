import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { getRankHistoryTool } from "./get-rank-history";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getConfigById: vi.fn(),
  getKeywordsForConfig: vi.fn(),
  getPositionMatrix: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
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
      getKeywordsForConfig: mocks.getKeywordsForConfig,
      getPositionMatrix: mocks.getPositionMatrix,
    },
  }),
);

const projectId = "11111111-1111-4111-8111-111111111111";
const trackerId = "22222222-2222-4222-8222-222222222222";

function run(args: Record<string, unknown> = {}) {
  const parsed = z
    .object(getRankHistoryTool.config.inputSchema)
    .parse({ projectId, trackerId, ...args });
  return getRankHistoryTool.handler(parsed, makeToolContext());
}

describe("get_rank_history", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({ id: projectId });
    mocks.getConfigById.mockResolvedValue({
      id: trackerId,
      domain: "example.com",
      devices: "both",
    });
    mocks.getKeywordsForConfig.mockResolvedValue([
      { id: "kw_old", keyword: "seo tools", pinnedAt: null },
      { id: "kw_new", keyword: "audit", pinnedAt: null },
    ]);
    mocks.getPositionMatrix.mockResolvedValue([
      {
        runId: "run_1",
        checkedAt: "2026-10-01 08:00:00",
        trackingKeywordId: "kw_old",
        position: 9,
        checked: true,
      },
      {
        runId: "run_2",
        checkedAt: "2026-10-08 08:00:00",
        trackingKeywordId: "kw_old",
        position: null,
        checked: true,
      },
      {
        runId: "run_2",
        checkedAt: "2026-10-08 08:00:00",
        trackingKeywordId: "kw_new",
        position: null,
        checked: false,
      },
    ]);
  });

  it("lists each keyword's positions newest first and tells not found from not checked", async () => {
    const result = await run();
    const text = textContent(result);

    expect(text).toContain(
      "trackingKeywordId | keyword | 2026-10-08 08:00 | 2026-10-01 08:00",
    );
    // kw_new was added after run_1, so that cell is blank.
    expect(text).toContain("kw_new | audit | not checked | ");
    expect(text).toContain("kw_old | seo tools | — | 9");
    expect(result.structuredContent.rows[1]).toMatchObject({
      trackingKeywordId: "kw_old",
      history: [
        { runId: "run_2", position: null, checked: true },
        { runId: "run_1", position: 9, checked: true },
      ],
    });
  });

  it("reads mobile for a mobile-only tracker and refuses desktop", async () => {
    mocks.getConfigById.mockResolvedValue({
      id: trackerId,
      domain: "example.com",
      devices: "mobile",
    });

    await run({ runs: 3 });
    expect(mocks.getPositionMatrix).toHaveBeenCalledWith(
      trackerId,
      "mobile",
      3,
    );

    await expect(run({ device: "desktop" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("does not read history for a tracker outside the project", async () => {
    mocks.getConfigById.mockResolvedValue(null);

    await expect(run()).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.getPositionMatrix).not.toHaveBeenCalled();
  });
});
