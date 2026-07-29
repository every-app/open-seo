import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasPagespeedApiKey: vi.fn<() => Promise<boolean>>(),
  runPagespeed: vi.fn(),
  isExpectedPagespeedFailure: vi.fn(() => false),
  listByProjectId: vi.fn(),
  getByIdForProject: vi.fn(),
  insert: vi.fn(),
  deleteByIdForProject: vi.fn(),
  setScheduleEnabled: vi.fn(),
  insertMany: vi.fn((values: unknown[]) => Promise.resolve(values)),
  listSnapshotsByProjectId:
    vi.fn<
      (projectId: string, limit: number) => Promise<Record<string, unknown>[]>
    >(),
  listByUrlId: vi.fn(() => Promise.resolve([])),
  getSnapshotByIdForProject: vi.fn(),
  putTextToR2:
    vi.fn<
      (key: string, body: string) => Promise<{ key: string; sizeBytes: number }>
    >(),
  getJsonFromR2: vi.fn(() => Promise.resolve('{"issues":[]}')),
  readStoredPagespeedPayload:
    vi.fn<(json: string) => { issues: Record<string, unknown>[] }>(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));

vi.mock("@/server/lib/r2", () => ({
  putTextToR2: mocks.putTextToR2,
  getJsonFromR2: mocks.getJsonFromR2,
}));
vi.mock("@/server/lib/pagespeedStoredPayload", () => ({
  readStoredPagespeedPayload: mocks.readStoredPagespeedPayload,
}));

vi.mock("@/server/lib/pagespeedClient", () => ({
  hasPagespeedApiKey: mocks.hasPagespeedApiKey,
  isExpectedPagespeedFailure: mocks.isExpectedPagespeedFailure,
  createPagespeedClient: () => ({ runPagespeed: mocks.runPagespeed }),
}));

vi.mock(
  "@/server/features/pagespeed/repositories/PagespeedUrlRepository",
  () => ({
    PagespeedUrlRepository: {
      listByProjectId: mocks.listByProjectId,
      getByIdForProject: mocks.getByIdForProject,
      insert: mocks.insert,
      deleteByIdForProject: mocks.deleteByIdForProject,
      setScheduleEnabled: mocks.setScheduleEnabled,
    },
  }),
);

vi.mock(
  "@/server/features/pagespeed/repositories/PagespeedSnapshotRepository",
  () => ({
    PagespeedSnapshotRepository: {
      insertMany: mocks.insertMany,
      listByProjectId: mocks.listSnapshotsByProjectId,
      listByUrlId: mocks.listByUrlId,
      getByIdForProject: mocks.getSnapshotByIdForProject,
    },
  }),
);

const CONTEXT = {
  projectId: "proj_1",
  organizationId: "org_1",
  userId: "user_1",
};

describe("PagespeedService runs and stored detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasPagespeedApiKey.mockResolvedValue(true);
    mocks.isExpectedPagespeedFailure.mockReturnValue(false);
    mocks.insertMany.mockImplementation((values: unknown[]) =>
      Promise.resolve(values),
    );
    mocks.listSnapshotsByProjectId.mockResolvedValue([]);
    mocks.putTextToR2.mockResolvedValue({
      key: "pagespeed/p/u/mobile-1.json",
      sizeBytes: 1234,
    });
    mocks.getJsonFromR2.mockResolvedValue('{"issues":[]}');
  });

  it("runs both strategies and stores a snapshot for each", async () => {
    mocks.getByIdForProject.mockResolvedValue({
      id: "u1",
      url: "https://a.com/",
    });
    mocks.runPagespeed.mockResolvedValue({
      result: { performanceScore: 90 },
      payloadJson: '{"issues":[]}',
    });
    const { PagespeedService } = await import("./PagespeedService");

    await PagespeedService.runForUrl({ projectId: "proj_1", urlId: "u1" });

    expect(mocks.runPagespeed).toHaveBeenCalledTimes(2);
    expect(mocks.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({ strategy: "mobile", performanceScore: 90 }),
      expect.objectContaining({ strategy: "desktop", performanceScore: 90 }),
    ]);
  });

  it("records a failing strategy as an error row without losing the other", async () => {
    mocks.getByIdForProject.mockResolvedValue({
      id: "u1",
      url: "https://a.com/",
    });
    mocks.isExpectedPagespeedFailure.mockReturnValue(true);
    mocks.runPagespeed
      .mockResolvedValueOnce({
        result: { performanceScore: 90 },
        payloadJson: null,
      })
      .mockRejectedValueOnce(new Error("quota reached"));
    const { PagespeedService } = await import("./PagespeedService");

    await PagespeedService.runForUrl({ projectId: "proj_1", urlId: "u1" });

    const rows = mocks.insertMany.mock.calls[0]?.[0] ?? [];
    expect(rows[0]).toMatchObject({
      strategy: "mobile",
      performanceScore: 90,
      errorMessage: null,
    });
    expect(rows[1]).toMatchObject({
      strategy: "desktop",
      errorMessage: "quota reached",
    });
  });

  it("stores the drill-down payload and records its key and size", async () => {
    mocks.getByIdForProject.mockResolvedValue({
      id: "u1",
      url: "https://a.com/",
    });
    mocks.runPagespeed.mockResolvedValue({
      result: { performanceScore: 90 },
      payloadJson: '{"issues":[]}',
    });
    const { PagespeedService } = await import("./PagespeedService");

    await PagespeedService.runForUrl({ projectId: "proj_1", urlId: "u1" });

    expect(mocks.putTextToR2).toHaveBeenCalledTimes(2);
    expect(mocks.putTextToR2.mock.calls[0]?.[0]).toMatch(
      /^pagespeed\/proj_1\/u1\/(mobile|desktop)-\d+\.json$/,
    );
    const rows = mocks.insertMany.mock.calls[0]?.[0] ?? [];
    expect(rows[0]).toMatchObject({
      r2Key: "pagespeed/p/u/mobile-1.json",
      payloadSizeBytes: 1234,
    });
  });

  it("keeps the metrics row when the payload upload fails", async () => {
    mocks.getByIdForProject.mockResolvedValue({
      id: "u1",
      url: "https://a.com/",
    });
    mocks.runPagespeed.mockResolvedValue({
      result: { performanceScore: 90 },
      payloadJson: '{"issues":[]}',
    });
    mocks.putTextToR2.mockRejectedValue(new Error("R2 down"));
    const { PagespeedService } = await import("./PagespeedService");

    await PagespeedService.runForUrl({ projectId: "proj_1", urlId: "u1" });

    const rows = mocks.insertMany.mock.calls[0]?.[0] ?? [];
    // A lost drill-down must not turn a good run into an error row.
    expect(rows[0]).toMatchObject({
      performanceScore: 90,
      errorMessage: null,
      r2Key: null,
      payloadSizeBytes: null,
    });
  });

  it("writes no payload when the response carried no lighthouseResult", async () => {
    mocks.getByIdForProject.mockResolvedValue({
      id: "u1",
      url: "https://a.com/",
    });
    mocks.runPagespeed.mockResolvedValue({
      result: { performanceScore: 90 },
      payloadJson: null,
    });
    const { PagespeedService } = await import("./PagespeedService");

    await PagespeedService.runForUrl({ projectId: "proj_1", urlId: "u1" });

    expect(mocks.putTextToR2).not.toHaveBeenCalled();
  });

  it("reports no stored detail for a run without an r2 key", async () => {
    mocks.getSnapshotByIdForProject.mockResolvedValue({
      id: "s1",
      r2Key: null,
    });
    const { PagespeedService } = await import("./PagespeedService");

    const payload = await PagespeedService.getSnapshotIssues({
      projectId: "proj_1",
      snapshotId: "s1",
    });

    expect(payload).toBeNull();
    expect(mocks.getJsonFromR2).not.toHaveBeenCalled();
  });

  it("resolves the latest run per URL and reads its stored issues", async () => {
    mocks.listByProjectId.mockResolvedValue([
      { id: "u1", url: "https://a.com/" },
      { id: "u2", url: "https://a.com/pricing" },
    ]);
    mocks.listSnapshotsByProjectId.mockResolvedValue([
      {
        id: "s_new",
        urlId: "u1",
        strategy: "mobile",
        createdAt: "2026-07-30T10:00:00.000Z",
        errorMessage: null,
        r2Key: "pagespeed/p/u1/mobile-2.json",
      },
      {
        id: "s_old",
        urlId: "u1",
        strategy: "mobile",
        createdAt: "2026-07-29T10:00:00.000Z",
        errorMessage: null,
        r2Key: "pagespeed/p/u1/mobile-1.json",
      },
      {
        id: "s_none",
        urlId: "u2",
        strategy: "mobile",
        createdAt: "2026-07-30T10:00:00.000Z",
        errorMessage: null,
        r2Key: null,
      },
    ]);
    mocks.readStoredPagespeedPayload.mockReturnValue({
      issues: [{ auditKey: "unused-javascript" }],
    });
    const { PagespeedService } = await import("./PagespeedService");

    const results = await PagespeedService.getLatestIssues({
      ...CONTEXT,
      domain: "a.com",
      strategy: "mobile",
    });

    // Only the newest run per URL is read, not every historical one.
    expect(mocks.getJsonFromR2).toHaveBeenCalledTimes(1);
    expect(mocks.getJsonFromR2).toHaveBeenCalledWith(
      "pagespeed/p/u1/mobile-2.json",
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      url: "https://a.com/",
      available: true,
    });
    // A URL with no stored payload degrades rather than failing the call.
    expect(results[1]).toMatchObject({
      url: "https://a.com/pricing",
      available: false,
      issues: [],
    });
  });

  it("degrades one URL to unavailable when its R2 read fails", async () => {
    mocks.listByProjectId.mockResolvedValue([
      { id: "u1", url: "https://a.com/" },
    ]);
    mocks.listSnapshotsByProjectId.mockResolvedValue([
      {
        id: "s1",
        urlId: "u1",
        strategy: "mobile",
        createdAt: "2026-07-30T10:00:00.000Z",
        errorMessage: null,
        r2Key: "pagespeed/p/u1/mobile-1.json",
      },
    ]);
    mocks.getJsonFromR2.mockRejectedValue(new Error("R2 miss"));
    const { PagespeedService } = await import("./PagespeedService");

    const results = await PagespeedService.getLatestIssues({
      ...CONTEXT,
      domain: "a.com",
      strategy: "mobile",
    });

    expect(results[0]).toMatchObject({ available: false, issues: [] });
  });

  it("refuses to read a snapshot belonging to another project", async () => {
    mocks.getSnapshotByIdForProject.mockResolvedValue(null);
    const { PagespeedService } = await import("./PagespeedService");

    await expect(
      PagespeedService.getSnapshotIssues({
        projectId: "proj_1",
        snapshotId: "other",
      }),
    ).rejects.toThrow(/does not exist/);
    expect(mocks.getJsonFromR2).not.toHaveBeenCalled();
  });

  it("refuses to run a URL belonging to another project", async () => {
    mocks.getByIdForProject.mockResolvedValue(null);
    const { PagespeedService } = await import("./PagespeedService");

    await expect(
      PagespeedService.runForUrl({ projectId: "proj_1", urlId: "other" }),
    ).rejects.toThrow(/not monitored/);
    expect(mocks.runPagespeed).not.toHaveBeenCalled();
  });
});
