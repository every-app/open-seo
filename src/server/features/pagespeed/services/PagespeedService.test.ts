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

describe("normalizePagespeedUrl", () => {
  it("strips the fragment but keeps the query", async () => {
    const { normalizePagespeedUrl } = await import("./PagespeedService");
    expect(normalizePagespeedUrl("  https://a.com/p?x=1#top  ")).toBe(
      "https://a.com/p?x=1",
    );
  });

  it("rejects input that is not an absolute http(s) URL", async () => {
    const { normalizePagespeedUrl } = await import("./PagespeedService");
    expect(() => normalizePagespeedUrl("example.com")).toThrow();
    expect(() => normalizePagespeedUrl("ftp://example.com")).toThrow();
  });
});

describe("homepageUrlForDomain", () => {
  it("adds a scheme and reduces to the origin root", async () => {
    const { homepageUrlForDomain } = await import("./PagespeedService");
    expect(homepageUrlForDomain("example.com")).toBe("https://example.com/");
    expect(homepageUrlForDomain("https://example.com/deep")).toBe(
      "https://example.com/",
    );
  });

  it("returns null for a project with no domain", async () => {
    const { homepageUrlForDomain } = await import("./PagespeedService");
    expect(homepageUrlForDomain(null)).toBeNull();
    expect(homepageUrlForDomain("   ")).toBeNull();
  });
});

describe("PagespeedService", () => {
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

  it("refuses to do anything without an API key", async () => {
    mocks.hasPagespeedApiKey.mockResolvedValue(false);
    const { PagespeedService, PagespeedNotConfiguredError } =
      await import("./PagespeedService");

    await expect(
      PagespeedService.getOverview({ ...CONTEXT, domain: "example.com" }),
    ).rejects.toBeInstanceOf(PagespeedNotConfiguredError);
  });

  it("seeds the homepage on first load", async () => {
    mocks.listByProjectId
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "u1", url: "https://example.com/" }]);
    const { PagespeedService } = await import("./PagespeedService");

    const overview = await PagespeedService.getOverview({
      ...CONTEXT,
      domain: "example.com",
    });

    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/",
        isHomepage: true,
      }),
    );
    expect(overview.urls).toHaveLength(1);
  });

  it("does not seed when the project has no domain", async () => {
    mocks.listByProjectId.mockResolvedValue([]);
    const { PagespeedService } = await import("./PagespeedService");

    await PagespeedService.getOverview({ ...CONTEXT, domain: null });

    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not re-seed when URLs already exist", async () => {
    mocks.listByProjectId.mockResolvedValue([{ id: "u1" }]);
    const { PagespeedService } = await import("./PagespeedService");

    await PagespeedService.getOverview({ ...CONTEXT, domain: "example.com" });

    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects a duplicate URL", async () => {
    mocks.listByProjectId.mockResolvedValue([{ url: "https://a.com/p" }]);
    const { PagespeedService } = await import("./PagespeedService");

    await expect(
      PagespeedService.addUrl({ ...CONTEXT, url: "https://a.com/p#frag" }),
    ).rejects.toThrow(/already being monitored/);
  });

  it("reports a conflict when a concurrent add wins the race", async () => {
    mocks.listByProjectId.mockResolvedValue([]);
    // onConflictDoNothing returned no row: someone else inserted it first.
    mocks.insert.mockResolvedValue(null);
    const { PagespeedService } = await import("./PagespeedService");

    await expect(
      PagespeedService.addUrl({ ...CONTEXT, url: "https://a.com/p" }),
    ).rejects.toThrow(/already being monitored/);
  });

  it("enforces the per-project URL cap", async () => {
    const { PagespeedService, MAX_URLS_PER_PROJECT } =
      await import("./PagespeedService");
    mocks.listByProjectId.mockResolvedValue(
      Array.from({ length: MAX_URLS_PER_PROJECT }, (_, i) => ({
        url: `https://a.com/${i}`,
      })),
    );

    await expect(
      PagespeedService.addUrl({ ...CONTEXT, url: "https://a.com/new" }),
    ).rejects.toThrow(/up to 20 URLs/);
  });

  it("pauses and resumes a URL without touching its history", async () => {
    mocks.getByIdForProject.mockResolvedValue({
      id: "u1",
      url: "https://a.com/",
    });
    const { PagespeedService } = await import("./PagespeedService");

    await PagespeedService.setUrlSchedule({
      projectId: "proj_1",
      urlId: "u1",
      enabled: false,
    });

    expect(mocks.setScheduleEnabled).toHaveBeenCalledWith(
      "u1",
      "proj_1",
      false,
    );
    // Pausing must not delete the URL or its snapshots.
    expect(mocks.deleteByIdForProject).not.toHaveBeenCalled();
  });

  it("refuses to pause a URL belonging to another project", async () => {
    mocks.getByIdForProject.mockResolvedValue(null);
    const { PagespeedService } = await import("./PagespeedService");

    await expect(
      PagespeedService.setUrlSchedule({
        projectId: "proj_1",
        urlId: "other",
        enabled: false,
      }),
    ).rejects.toThrow(/not monitored/);
    expect(mocks.setScheduleEnabled).not.toHaveBeenCalled();
  });
});
