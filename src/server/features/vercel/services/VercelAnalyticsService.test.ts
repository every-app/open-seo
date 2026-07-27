import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  type AggregateOpts = {
    vercelProjectId: string;
    vercelTeamId: string | null;
    by: string;
  };
  const listProjects = vi.fn();
  const getVisitTotals = vi.fn();
  const getVisitAggregate =
    vi.fn<(opts: AggregateOpts) => Promise<unknown[]>>();
  const getEventAggregate =
    vi.fn<
      (opts: AggregateOpts & { eventName?: string }) => Promise<unknown[]>
    >();
  return {
    listProjects,
    getVisitTotals,
    getVisitAggregate,
    getEventAggregate,
    createVercelAnalyticsClient: vi.fn(() => ({
      listProjects,
      getVisitTotals,
      getVisitAggregate,
      getEventAggregate,
    })),
    getByProjectId: vi.fn(),
    upsert: vi.fn(),
    deleteByProjectId: vi.fn(),
  };
});

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/vercelAnalytics", () => ({
  createVercelAnalyticsClient: mocks.createVercelAnalyticsClient,
}));
vi.mock(
  "@/server/features/vercel/repositories/VercelConnectionRepository",
  () => ({
    VercelConnectionRepository: {
      getByProjectId: mocks.getByProjectId,
      upsert: mocks.upsert,
      deleteByProjectId: mocks.deleteByProjectId,
    },
  }),
);

const connection = {
  projectId: "p1",
  vercelProjectId: "prj_1",
  vercelTeamId: "team_1",
  vercelProjectName: "scholar-sidekick",
};

describe("trafficRanges", () => {
  it("builds an exact 30-day window and the preceding 30 days", async () => {
    const { trafficRanges } = await import("./VercelAnalyticsService");
    const { range, prevRange } = trafficRanges(
      new Date("2026-07-26T10:00:00.000Z"),
    );
    expect(range).toEqual({ since: "2026-06-27", until: "2026-07-27" });
    expect(prevRange).toEqual({ since: "2026-05-28", until: "2026-06-27" });
  });
});

describe("VercelAnalyticsService.setProject", () => {
  beforeEach(() => {
    mocks.listProjects.mockReset();
    mocks.upsert.mockReset();
  });

  it("rejects a project id the token cannot see", async () => {
    mocks.listProjects.mockResolvedValue([
      { id: "prj_other", name: "other", teamId: null, teamSlug: null },
    ]);
    const { VercelAnalyticsService } = await import("./VercelAnalyticsService");

    await expect(
      VercelAnalyticsService.setProject({
        projectId: "p1",
        organizationId: "org1",
        vercelProjectId: "prj_unknown",
        userId: "u1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("stores the matched project with its team", async () => {
    mocks.listProjects.mockResolvedValue([
      {
        id: "prj_1",
        name: "scholar-sidekick",
        teamId: "team_1",
        teamSlug: "acme",
      },
    ]);
    mocks.upsert.mockResolvedValue(connection);
    const { VercelAnalyticsService } = await import("./VercelAnalyticsService");

    await VercelAnalyticsService.setProject({
      projectId: "p1",
      organizationId: "org1",
      vercelProjectId: "prj_1",
      userId: "u1",
    });

    expect(mocks.upsert).toHaveBeenCalledWith({
      projectId: "p1",
      organizationId: "org1",
      vercelProjectId: "prj_1",
      vercelTeamId: "team_1",
      vercelProjectName: "scholar-sidekick",
      connectedByUserId: "u1",
    });
  });
});

describe("VercelAnalyticsService.getTraffic", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockReset();
    mocks.getVisitTotals.mockReset();
    mocks.getVisitAggregate.mockReset();
  });

  it("throws VercelNotConnectedError when the project has no connection", async () => {
    mocks.getByProjectId.mockResolvedValue(null);
    const { VercelAnalyticsService, VercelNotConnectedError } =
      await import("./VercelAnalyticsService");

    await expect(
      VercelAnalyticsService.getTraffic({ projectId: "p1" }),
    ).rejects.toBeInstanceOf(VercelNotConnectedError);
  });

  it("fans out totals, prior totals, daily, referrers, pages, and events", async () => {
    mocks.getByProjectId.mockResolvedValue(connection);
    mocks.getVisitTotals
      .mockResolvedValueOnce({ visitors: 100, pageviews: 200 })
      .mockResolvedValueOnce({ visitors: 50, pageviews: 90 });
    mocks.getVisitAggregate.mockResolvedValue([]);
    mocks.getEventAggregate
      .mockResolvedValueOnce([
        { key: "audit_completed", visitors: 5, count: 11 },
      ])
      .mockResolvedValueOnce([
        { key: "audit_completed", visitors: 3, count: 6 },
      ]);
    const { VercelAnalyticsService } = await import("./VercelAnalyticsService");

    const report = await VercelAnalyticsService.getTraffic({
      projectId: "p1",
    });

    expect(report.vercelProjectName).toBe("scholar-sidekick");
    expect(report.totals).toEqual({ visitors: 100, pageviews: 200 });
    expect(report.prevTotals).toEqual({ visitors: 50, pageviews: 90 });
    expect(report.events).toEqual([
      { key: "audit_completed", visitors: 5, count: 11 },
    ]);
    expect(report.prevEvents).toEqual([
      { key: "audit_completed", visitors: 3, count: 6 },
    ]);
    expect(mocks.getVisitAggregate).toHaveBeenCalledTimes(3);
    const dims = mocks.getVisitAggregate.mock.calls.map((call) => call[0].by);
    expect(dims).toEqual(["day", "referrerHostname", "requestPath"]);
    // Both event calls group by eventName, one per range.
    expect(
      mocks.getEventAggregate.mock.calls.map((call) => call[0].by),
    ).toEqual(["eventName", "eventName"]);
    // Every call targets the connected Vercel project + team.
    for (const call of mocks.getVisitAggregate.mock.calls) {
      expect(call[0]).toMatchObject({
        vercelProjectId: "prj_1",
        vercelTeamId: "team_1",
      });
    }
  });
});

describe("VercelAnalyticsService.getEventTrend", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockReset();
    mocks.getEventAggregate.mockReset().mockResolvedValue([]);
  });

  it("throws VercelNotConnectedError when the project has no connection", async () => {
    mocks.getByProjectId.mockResolvedValue(null);
    const { VercelAnalyticsService, VercelNotConnectedError } =
      await import("./VercelAnalyticsService");

    await expect(
      VercelAnalyticsService.getEventTrend({
        projectId: "p1",
        eventName: "audit_completed",
      }),
    ).rejects.toBeInstanceOf(VercelNotConnectedError);
  });

  it("requests a by-day series narrowed to the event", async () => {
    mocks.getByProjectId.mockResolvedValue(connection);
    const { VercelAnalyticsService } = await import("./VercelAnalyticsService");

    const trend = await VercelAnalyticsService.getEventTrend({
      projectId: "p1",
      eventName: "audit_completed",
    });

    expect(trend.eventName).toBe("audit_completed");
    expect(mocks.getEventAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        by: "day",
        eventName: "audit_completed",
        vercelProjectId: "prj_1",
      }),
    );
  });
});
