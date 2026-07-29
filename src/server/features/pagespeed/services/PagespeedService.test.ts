import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hasPagespeedApiKey: vi.fn<() => Promise<boolean>>(),
  runPagespeed: vi.fn(),
  isExpectedPagespeedFailure: vi.fn(() => false),
  listByProjectId: vi.fn(),
  getByIdForProject: vi.fn(),
  insert: vi.fn(),
  deleteByIdForProject: vi.fn(),
  insertMany: vi.fn((values: unknown[]) => Promise.resolve(values)),
  listSnapshotsByProjectId: vi.fn(() => Promise.resolve([])),
  listByUrlId: vi.fn(() => Promise.resolve([])),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));

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
    ).rejects.toThrow(/up to 10 URLs/);
  });

  it("runs both strategies and stores a snapshot for each", async () => {
    mocks.getByIdForProject.mockResolvedValue({
      id: "u1",
      url: "https://a.com/",
    });
    mocks.runPagespeed.mockResolvedValue({ performanceScore: 90 });
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
      .mockResolvedValueOnce({ performanceScore: 90 })
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

  it("refuses to run a URL belonging to another project", async () => {
    mocks.getByIdForProject.mockResolvedValue(null);
    const { PagespeedService } = await import("./PagespeedService");

    await expect(
      PagespeedService.runForUrl({ projectId: "proj_1", urlId: "other" }),
    ).rejects.toThrow(/not monitored/);
    expect(mocks.runPagespeed).not.toHaveBeenCalled();
  });
});
