import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRankHistoryTool } from "./get-rank-history";
import { makeToolContext, textContent } from "./tool-test-support";

// Pins the get_rank_history payload: page of checks with position semantics
// ("—" = not found in tracked depth, not a failure), failure visibility via
// run entries, and pagination hints.

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  getRankHistory: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/rank-tracking/services/rankTrackingResults", () => ({
  getRankHistory: mocks.getRankHistory,
}));

const toolContext = makeToolContext();

const config = {
  id: "cfg_1",
  projectId: "project_1",
  domain: "example.com",
  serpDepth: 100,
};
const run = {
  id: "run_1",
  status: "completed",
  errorMessage: null,
  keywordsChecked: 2,
  keywordsTotal: 2,
  startedAt: "2026-10-01 03:00:00",
  completedAt: "2026-10-01 03:01:00",
};
const check = {
  keyword: "seo tools",
  device: "desktop",
  position: 12,
  url: "https://example.com/tools",
  checkedAt: "2026-10-01 03:00:30",
  runId: "run_1",
  runStatus: "completed",
  runErrorMessage: null,
};

describe("get_rank_history", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
  });

  it("renders checks as a text table with run status", async () => {
    mocks.getRankHistory.mockResolvedValue({
      config,
      checks: { rows: [check], totalCount: 1 },
      runs: [run],
    });

    const result = await getRankHistoryTool.handler(
      { projectId: "project_1", trackerId: config.id },
      toolContext,
    );

    const out = textContent(result);
    expect(out).toContain(
      "keyword | device | position | url | checked | run status",
    );
    expect(out).toContain(
      "seo tools | desktop | 12 | https://example.com/tools | 2026-10-01 03:00:30 | completed",
    );
    expect(result.structuredContent).toMatchObject({
      totalCount: 1,
      hasMore: false,
    });
  });

  it("shows a failed run's reason and no fabricated rows", async () => {
    mocks.getRankHistory.mockResolvedValue({
      config,
      checks: { rows: [], totalCount: 0 },
      runs: [
        {
          ...run,
          status: "failed",
          errorMessage: "Insufficient credits",
          keywordsChecked: 0,
        },
      ],
    });

    const result = await getRankHistoryTool.handler(
      { projectId: "project_1", trackerId: config.id },
      toolContext,
    );

    const out = textContent(result);
    expect(out).toContain("No saved rank checks");
    expect(result.structuredContent).toMatchObject({
      runs: [{ status: "failed", errorMessage: "Insufficient credits" }],
    });
  });

  it("points to the next page when more checks exist", async () => {
    mocks.getRankHistory.mockResolvedValue({
      config,
      checks: { rows: [check], totalCount: 3 },
      runs: [run],
    });

    const result = await getRankHistoryTool.handler(
      { projectId: "project_1", trackerId: config.id },
      toolContext,
    );

    expect(textContent(result)).toContain("offset=1");
  });
});
