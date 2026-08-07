import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const state: {
    grants: Array<{ id: string; accountId: string }>;
  } = { grants: [] };
  const getByProjectId = vi.fn();
  const upsert = vi.fn();
  const deleteByProjectId = vi.fn();
  const existsForConnectorAccount = vi.fn();
  const getVisibility = vi.fn();
  const getCrawlIssues = vi.fn();
  const createBingClient = vi.fn();
  const getBingWebmasterApiKey = vi.fn();
  const dbSelect = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => {
        const rows = state.grants;
        return Object.assign(Promise.resolve(rows), {
          limit: vi.fn().mockResolvedValue(rows),
        });
      }),
    })),
  }));
  const dbDelete = vi.fn(() => ({
    where: vi
      .fn<(condition: SQL) => Promise<void>>()
      .mockResolvedValue(undefined),
  }));

  return {
    state,
    dbSelect,
    dbDelete,
    getByProjectId,
    upsert,
    deleteByProjectId,
    existsForConnectorAccount,
    getVisibility,
    getCrawlIssues,
    createBingClient,
    getBingWebmasterApiKey,
  };
});

vi.mock("@/db", () => ({
  db: {
    select: mocks.dbSelect,
    delete: mocks.dbDelete,
  },
}));
vi.mock("@/db/schema", () => ({
  account: {
    id: "id",
    userId: "userId",
    providerId: "providerId",
    accountId: "accountId",
  },
}));
vi.mock("@/server/features/bing/oauth-config", () => ({
  getBingWebmasterApiKey: mocks.getBingWebmasterApiKey,
}));
vi.mock("@/server/features/bing/repositories/BingConnectionRepository", () => ({
  BingConnectionRepository: {
    getByProjectId: mocks.getByProjectId,
    upsert: mocks.upsert,
    deleteByProjectId: mocks.deleteByProjectId,
    existsForConnectorAccount: mocks.existsForConnectorAccount,
  },
}));
vi.mock("@/server/lib/bingClient", () => ({
  BingApiError: class BingApiError extends Error {
    status = 403;
  },
  BingTokenError: class BingTokenError extends Error {},
  createBingClient: mocks.createBingClient,
  getBingSiteUrl: (site: { Url?: string; siteUrl?: string }) =>
    site.siteUrl ?? site.Url ?? null,
}));

describe("BingService", () => {
  beforeEach(() => {
    mocks.state.grants = [];
    mocks.getByProjectId.mockReset();
    mocks.upsert.mockReset();
    mocks.deleteByProjectId.mockReset();
    mocks.existsForConnectorAccount.mockReset();
    mocks.getVisibility.mockReset();
    mocks.getCrawlIssues.mockReset();
    mocks.createBingClient.mockReset();
    mocks.getBingWebmasterApiKey.mockReset().mockResolvedValue(null);
  });

  it("returns visibility for the project's connected property", async () => {
    mocks.getByProjectId.mockResolvedValue({
      projectId: "p1",
      siteUrl: "https://example.com/",
      connectedByUserId: "u1",
      bingAccountId: "sub-a",
      connectedAccountEmail: "owner@example.com",
    });
    mocks.getVisibility.mockResolvedValue({ Clicks: 10 });
    mocks.createBingClient.mockReturnValue({
      getVisibility: mocks.getVisibility,
    });
    const { BingService } = await import("./BingService");

    await expect(
      BingService.getVisibility({ projectId: "p1" }),
    ).resolves.toEqual({
      siteUrl: "https://example.com/",
      connectedBy: "owner@example.com",
      visibility: { Clicks: 10 },
    });
    expect(mocks.createBingClient).toHaveBeenCalledWith({
      userId: "u1",
      bingAccountId: "sub-a",
    });
  });

  it("requires a connection before requesting crawl issues", async () => {
    mocks.getByProjectId.mockResolvedValue(null);
    const { BingNotConnectedError, BingService } =
      await import("./BingService");

    await expect(
      BingService.getCrawlIssues({ projectId: "p1" }),
    ).rejects.toBeInstanceOf(BingNotConnectedError);
  });

  it("lists the synthetic API-key account for self-hosted deployments", async () => {
    mocks.getBingWebmasterApiKey.mockResolvedValue("key_123");
    mocks.createBingClient.mockReturnValue({
      listSites: vi.fn().mockResolvedValue([{ Url: "https://example.com/" }]),
    });
    const { BingService } = await import("./BingService");

    await expect(
      BingService.listSitesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      accounts: [
        {
          accountId: "api-key",
          email: null,
          requiresReconnect: false,
          sites: [{ Url: "https://example.com/" }],
        },
      ],
    });
    expect(mocks.createBingClient).toHaveBeenCalledWith({
      userId: "u1",
      apiKey: "key_123",
    });
  });
});
