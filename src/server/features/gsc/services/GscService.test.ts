import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listSites: vi.fn(),
  upsert: vi.fn(),
  getByProjectId: vi.fn(),
  deleteByProjectId: vi.fn(),
  existsForConnector: vi.fn(),
  dbDelete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({ db: { delete: mocks.dbDelete } }));
vi.mock("@/server/lib/gscClient", () => ({
  createGscClient: () => ({ listSites: mocks.listSites }),
  GscApiError: class extends Error {},
  GscTokenError: class extends Error {},
}));
vi.mock("@/server/features/gsc/repositories/GscConnectionRepository", () => ({
  GscConnectionRepository: {
    upsert: mocks.upsert,
    getByProjectId: mocks.getByProjectId,
    deleteByProjectId: mocks.deleteByProjectId,
    existsForConnector: mocks.existsForConnector,
  },
}));

const baseInput = {
  projectId: "p1",
  organizationId: "org1",
  userId: "u1",
  userEmail: "alice@example.com",
};

describe("GscService.setSite", () => {
  beforeEach(() => {
    mocks.listSites.mockReset();
    mocks.upsert.mockReset();
  });

  it("upserts a verified property using the connector's identity", async () => {
    mocks.listSites.mockResolvedValue([
      { siteUrl: "https://x/", permissionLevel: "siteOwner" },
    ]);
    mocks.upsert.mockResolvedValue({ siteUrl: "https://x/" });
    const { GscService } = await import("./GscService");

    await GscService.setSite({ ...baseInput, siteUrl: "https://x/" });

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        siteUrl: "https://x/",
        connectedByUserId: "u1",
        connectedAccountEmail: "alice@example.com",
      }),
    );
  });

  it("rejects an unverified property with FORBIDDEN", async () => {
    mocks.listSites.mockResolvedValue([
      { siteUrl: "https://x/", permissionLevel: "siteUnverifiedUser" },
    ]);
    const { GscService } = await import("./GscService");

    await expect(
      GscService.setSite({ ...baseInput, siteUrl: "https://x/" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects a property not on the grant with NOT_FOUND", async () => {
    mocks.listSites.mockResolvedValue([
      { siteUrl: "https://x/", permissionLevel: "siteOwner" },
    ]);
    const { GscService } = await import("./GscService");

    await expect(
      GscService.setSite({ ...baseInput, siteUrl: "https://not-mine/" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("GscService.disconnect", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockReset();
    mocks.deleteByProjectId.mockReset().mockResolvedValue(undefined);
    mocks.existsForConnector.mockReset();
    mocks.dbDelete.mockClear();
  });

  it("unlinks the connector's grant when they disconnect their last project", async () => {
    mocks.getByProjectId.mockResolvedValue({ connectedByUserId: "u1" });
    mocks.existsForConnector.mockResolvedValue(false);
    const { GscService } = await import("./GscService");

    await GscService.disconnect({ projectId: "p1", userId: "u1" });

    expect(mocks.deleteByProjectId).toHaveBeenCalledWith("p1");
    expect(mocks.existsForConnector).toHaveBeenCalledWith("u1");
    expect(mocks.dbDelete).toHaveBeenCalled(); // grant unlinked
  });

  it("keeps the grant when the connector still has another connected project", async () => {
    mocks.getByProjectId.mockResolvedValue({ connectedByUserId: "u1" });
    mocks.existsForConnector.mockResolvedValue(true);
    const { GscService } = await import("./GscService");

    await GscService.disconnect({ projectId: "p1", userId: "u1" });

    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("never revokes a grant when a different member disconnects the connection", async () => {
    mocks.getByProjectId.mockResolvedValue({ connectedByUserId: "owner" });
    const { GscService } = await import("./GscService");

    await GscService.disconnect({ projectId: "p1", userId: "other-member" });

    expect(mocks.deleteByProjectId).toHaveBeenCalledWith("p1");
    expect(mocks.existsForConnector).not.toHaveBeenCalled();
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("unlinks the caller's dangling grant when no property was ever bound", async () => {
    // Linked Google but never picked a property → no connection row. Disconnect
    // should still drop the caller's own grant.
    mocks.getByProjectId.mockResolvedValue(null);
    mocks.existsForConnector.mockResolvedValue(false);
    const { GscService } = await import("./GscService");

    await GscService.disconnect({ projectId: "p1", userId: "u1" });

    expect(mocks.existsForConnector).toHaveBeenCalledWith("u1");
    expect(mocks.dbDelete).toHaveBeenCalled(); // grant unlinked
  });
});
