import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardService } from "./DashboardService";

const mocks = vi.hoisted(() => ({
  getLatestForProject: vi.fn(),
  insert: vi.fn(),
  route: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/lib/seo-data", () => ({
  getSeoDataRouter: () => ({ route: mocks.route }),
}));
vi.mock(
  "@/server/features/dashboard/repositories/BacklinkSnapshotRepository",
  () => ({ BacklinkSnapshotRepository: mocks }),
);

const billingCustomer = {
  organizationId: "org_1",
  userId: "user_1",
  userEmail: "user@example.com",
};

const HOUR_MS = 60 * 60 * 1000;

function snapshotRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    projectId: "project_1",
    domain: "acme.com",
    rank: 42,
    backlinks: 1000,
    referringDomains: 500,
    brokenBacklinks: 2,
    newBacklinks: 10,
    lostBacklinks: 3,
    newReferringDomains: 4,
    lostReferringDomains: 1,
    capturedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("DashboardService.ensureBacklinkSnapshot", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
  });

  it("returns null without any call when the project has no domain", async () => {
    

    await expect(
      DashboardService.ensureBacklinkSnapshot({
        projectId: "project_1",
        domain: null,
        billingCustomer,
      }),
    ).resolves.toBeNull();

    expect(mocks.getLatestForProject).not.toHaveBeenCalled();
    expect(mocks.route).not.toHaveBeenCalled();
  });

  it("serves a fresh snapshot without touching the router", async () => {
    mocks.getLatestForProject.mockResolvedValue(snapshotRow());
    

    const result = await DashboardService.ensureBacklinkSnapshot({
      projectId: "project_1",
      domain: "acme.com",
      billingCustomer,
    });

    expect(mocks.route).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      domain: "acme.com",
      rank: 42,
      backlinks: 1000,
      referringDomains: 500,
      newBacklinks: 10,
      lostBacklinks: 3,
      newReferringDomains: 4,
      lostReferringDomains: 1,
      stale: false,
    });
  });

  it("routes stale snapshots through the backlinks router and write-throughs a paid fetch", async () => {
    mocks.getLatestForProject.mockResolvedValue(
      snapshotRow({ capturedAt: new Date(Date.now() - 25 * HOUR_MS).toISOString() }),
    );
    mocks.route.mockResolvedValue({
      data: {
        rank: 55,
        backlinks: 1200,
        referring_domains: 620,
        broken_backlinks: 3,
        new_backlinks: 14,
        lost_backlinks: 2,
        new_reffering_domains: 6,
        lost_reffering_domains: 1,
      },
      provider: "dataforseo",
      fromCache: false,
    });
    mocks.insert.mockImplementation((values: Record<string, unknown>) => {
      mocks.getLatestForProject.mockResolvedValue(snapshotRow(values));
      return Promise.resolve(snapshotRow(values));
    });
    

    const result = await DashboardService.ensureBacklinkSnapshot({
      projectId: "project_1",
      domain: "acme.com",
      billingCustomer,
    });

    expect(mocks.route).toHaveBeenCalledTimes(1);
    expect(mocks.route).toHaveBeenCalledWith({
      dataType: "backlinks",
      domain: "acme.com",
      billingCustomer,
      creditFeature: "backlinks",
      constraints: { projectId: "project_1", backlinkCall: "summary" },
    });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project_1",
        domain: "acme.com",
        rank: 55,
        backlinks: 1200,
        referringDomains: 620,
        brokenBacklinks: 3,
        newBacklinks: 14,
        lostBacklinks: 2,
        newReferringDomains: 6,
        lostReferringDomains: 1,
        capturedAt: expect.any(String),
      }),
    );
    expect(result).toMatchObject({
      domain: "acme.com",
      rank: 55,
      backlinks: 1200,
      referringDomains: 620,
      stale: false,
    });
  });

  it("materializes cached data into the snapshot table when no row exists yet", async () => {
    mocks.getLatestForProject.mockResolvedValue(null);
    mocks.route.mockResolvedValue({
      data: {
        rank: 9,
        backlinks: 300,
        referringDomains: 120,
        newBacklinks: 5,
        lostBacklinks: 0,
        newReferringDomains: 2,
        lostReferringDomains: 0,
      },
      provider: "internal",
      fromCache: true,
    });
    mocks.insert.mockImplementation((values: Record<string, unknown>) => {
      mocks.getLatestForProject.mockResolvedValue(snapshotRow(values));
      return Promise.resolve(snapshotRow(values));
    });
    

    const result = await DashboardService.ensureBacklinkSnapshot({
      projectId: "project_1",
      domain: "acme.com",
      billingCustomer,
    });

    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        rank: 9,
        backlinks: 300,
        referringDomains: 120,
        newBacklinks: 5,
        capturedAt: expect.any(String),
      }),
    );
    expect(result).toMatchObject({ domain: "acme.com", rank: 9 });
  });

  it("does not re-insert cached data over an existing row (no fake freshness)", async () => {
    mocks.getLatestForProject.mockResolvedValue(
      snapshotRow({ capturedAt: new Date(Date.now() - 25 * HOUR_MS).toISOString() }),
    );
    mocks.route.mockResolvedValue({
      data: {
        rank: 55,
        backlinks: 1200,
        referringDomains: 620,
        newBacklinks: 14,
        lostBacklinks: 2,
        newReferringDomains: 6,
        lostReferringDomains: 1,
      },
      provider: "internal",
      fromCache: true,
    });
    

    const result = await DashboardService.ensureBacklinkSnapshot({
      projectId: "project_1",
      domain: "acme.com",
      billingCustomer,
    });

    expect(mocks.insert).not.toHaveBeenCalled();
    expect(result).toMatchObject({ stale: true });
  });

  it("returns the stale snapshot when the refresh fails and a row exists", async () => {
    mocks.getLatestForProject.mockResolvedValue(
      snapshotRow({ capturedAt: new Date(Date.now() - 25 * HOUR_MS).toISOString() }),
    );
    mocks.route.mockRejectedValue(new Error("upstream down"));
    

    const result = await DashboardService.ensureBacklinkSnapshot({
      projectId: "project_1",
      domain: "acme.com",
      billingCustomer,
    });

    expect(mocks.insert).not.toHaveBeenCalled();
    expect(result).toMatchObject({ domain: "acme.com", rank: 42, stale: true });
  });

  it("rethrows when the refresh fails and no snapshot exists", async () => {
    mocks.getLatestForProject.mockResolvedValue(null);
    mocks.route.mockRejectedValue(new Error("budget exceeded"));
    

    await expect(
      DashboardService.ensureBacklinkSnapshot({
        projectId: "project_1",
        domain: "acme.com",
        billingCustomer,
      }),
    ).rejects.toThrow("budget exceeded");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});