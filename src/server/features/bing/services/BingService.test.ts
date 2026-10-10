import { beforeEach, describe, expect, it, vi } from "vitest";
import { BingService } from "./BingService";

const mocks = vi.hoisted(() => ({
  getBingAccessToken: vi.fn(),
  listSites: vi.fn(),
  queryStats: vi.fn(),
  getByProjectId: vi.fn(),
  upsert: vi.fn(),
  deleteByProjectId: vi.fn(),
  deleteById: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/bing/bingOAuth", () => ({
  getBingAccessToken: mocks.getBingAccessToken,
}));
vi.mock("@/server/lib/bingClient", () => ({
  createBingClient: vi.fn(() => ({
    listSites: mocks.listSites,
    queryStats: mocks.queryStats,
  })),
}));
vi.mock("@/server/features/bing/repositories/BingConnectionRepository", () => ({
  BingConnectionRepository: {
    getByProjectId: mocks.getByProjectId,
    upsert: mocks.upsert,
    deleteByProjectId: mocks.deleteByProjectId,
  },
}));
vi.mock("@/server/features/bing/repositories/BingCredentialRepository", () => ({
  BingCredentialRepository: {
    deleteById: mocks.deleteById,
  },
}));

const oauthConnection = {
  id: "conn-1",
  projectId: "project_1",
  organizationId: "org_1",
  siteUrl: "https://example.com/",
  connectedByUserId: "user_1",
  credentialId: null,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
};

describe("BingService OAuth branches", () => {
  beforeEach(() => {
    mocks.getBingAccessToken.mockResolvedValue("oauth-token");
    mocks.listSites.mockResolvedValue([
      { url: "https://example.com/", isVerified: true },
    ]);
    mocks.queryStats.mockResolvedValue([]);
  });

  it("saves a site on the OAuth grant with a null credential", async () => {
    mocks.upsert.mockResolvedValue(oauthConnection);

    await BingService.setSite({
      projectId: "project_1",
      organizationId: "org_1",
      credentialId: null,
      siteUrl: "https://example.com/",
      userId: "user_1",
    });

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ credentialId: null }),
    );
  });

  it("reads performance through the OAuth token", async () => {
    mocks.getByProjectId.mockResolvedValue(oauthConnection);

    const result = await BingService.getPerformance({
      projectId: "project_1",
      groupBy: "query",
    });

    expect(mocks.getBingAccessToken).toHaveBeenCalledWith({
      userId: "user_1",
    });
    expect(result.siteUrl).toBe("https://example.com/");
  });

  it("disconnect keeps the OAuth grant and only drops the mapping", async () => {
    mocks.getByProjectId.mockResolvedValue(oauthConnection);

    await BingService.disconnect({
      projectId: "project_1",
      userId: "user_1",
    });

    expect(mocks.deleteByProjectId).toHaveBeenCalledWith("project_1");
    expect(mocks.deleteById).not.toHaveBeenCalled();
  });
});
