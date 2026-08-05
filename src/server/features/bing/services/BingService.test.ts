import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class BingApiError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = "BingApiError";
    }
  }

  class BingTokenError extends Error {
    constructor(message = "token unavailable") {
      super(message);
      this.name = "BingTokenError";
    }
  }

  const state: { selectRows: Array<{ id: string; accountId: string }> } = {
    selectRows: [],
  };
  type BingClientOptions = { userId: string; bingAccountId?: string };
  type BingSite = {
    url: string;
    isVerified: boolean;
    authenticationCode: string | null;
    dnsVerificationCode: string | null;
  };
  const listSites = vi.fn<(opts: BingClientOptions) => Promise<BingSite[]>>();
  const getRankAndTrafficStats =
    vi.fn<(opts: BingClientOptions) => Promise<Record<string, unknown>[]>>();
  type BingStatRow = {
    key: string;
    clicks: number;
    impressions: number;
    date: string | null;
    avgImpressionPosition: number;
  };
  const getQueryStats =
    vi.fn<(opts: BingClientOptions) => Promise<BingStatRow[]>>();
  const getPageStats =
    vi.fn<(opts: BingClientOptions) => Promise<BingStatRow[]>>();
  const getConnectedEmail =
    vi.fn<(opts: BingClientOptions) => Promise<string | null>>();
  const deleteWhere = vi
    .fn<(condition: SQL) => Promise<void>>()
    .mockResolvedValue(undefined);
  const dbSelect = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => {
        const rows = state.selectRows;
        return Object.assign(Promise.resolve(rows), {
          limit: vi.fn().mockResolvedValue(rows),
        });
      }),
    })),
  }));

  return {
    state,
    dbSelect,
    deleteWhere,
    dbDelete: vi.fn(() => ({ where: deleteWhere })),
    listSites,
    getRankAndTrafficStats,
    getQueryStats,
    getPageStats,
    getConnectedEmail,
    createBingClient: vi.fn((opts: BingClientOptions) => ({
      listSites: () => listSites(opts),
      getRankAndTrafficStats: () => getRankAndTrafficStats(opts),
      getQueryStats: () => getQueryStats(opts),
      getPageStats: () => getPageStats(opts),
      getConnectedEmail: () => getConnectedEmail(opts),
    })),
    upsert: vi.fn(),
    getByProjectId: vi.fn(),
    deleteByProjectId: vi.fn(),
    existsForConnectorAccount: vi.fn(),
    BingApiError,
    BingTokenError,
  };
});

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({
  db: { select: mocks.dbSelect, delete: mocks.dbDelete },
}));
vi.mock("@/server/lib/bingClient", () => ({
  createBingClient: mocks.createBingClient,
  BingApiError: mocks.BingApiError,
  BingTokenError: mocks.BingTokenError,
}));
vi.mock("@/server/features/bing/repositories/BingConnectionRepository", () => ({
  BingConnectionRepository: {
    upsert: mocks.upsert,
    getByProjectId: mocks.getByProjectId,
    deleteByProjectId: mocks.deleteByProjectId,
    existsForConnectorAccount: mocks.existsForConnectorAccount,
  },
}));

const baseInput = {
  projectId: "p1",
  organizationId: "org1",
  accountId: "uid-a",
  userId: "u1",
};

const verifiedSite = {
  url: "https://x.example/",
  isVerified: true,
  authenticationCode: null,
  dnsVerificationCode: null,
};

function resetClientMocks() {
  mocks.listSites.mockReset();
  mocks.getConnectedEmail.mockReset();
  mocks.getConnectedEmail.mockResolvedValue("owner@example.com");
}

describe("BingService.setSite", () => {
  beforeEach(() => {
    mocks.state.selectRows = [{ id: "grant-a", accountId: "uid-a" }];
    resetClientMocks();
    mocks.createBingClient.mockClear();
    mocks.upsert.mockReset();
  });

  it("upserts a verified site with the selected grant in oauth mode", async () => {
    mocks.listSites.mockResolvedValue([verifiedSite]);
    mocks.upsert.mockResolvedValue({ siteUrl: "https://x.example/" });
    const { BingService } = await import("./BingService");

    await BingService.setSite({ ...baseInput, siteUrl: "https://x.example/" });

    expect(mocks.createBingClient).toHaveBeenCalledWith({
      userId: "u1",
      bingAccountId: "uid-a",
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        organizationId: "org1",
        siteUrl: "https://x.example/",
        connectedByUserId: "u1",
        bingAccountId: "uid-a",
        connectedAccountEmail: "owner@example.com",
        authMode: "oauth",
      }),
    );
  });

  it("rejects a Bing account that is not one of the caller's grants", async () => {
    const { BingService } = await import("./BingService");

    await expect(
      BingService.setSite({
        ...baseInput,
        accountId: "foreign-uid",
        siteUrl: "https://x.example/",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.createBingClient).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects a site not on the selected grant with NOT_FOUND", async () => {
    mocks.listSites.mockResolvedValue([verifiedSite]);
    const { BingService } = await import("./BingService");

    await expect(
      BingService.setSite({ ...baseInput, siteUrl: "https://not-mine/" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects an unverified site with FORBIDDEN", async () => {
    mocks.listSites.mockResolvedValue([{ ...verifiedSite, isVerified: false }]);
    const { BingService } = await import("./BingService");

    await expect(
      BingService.setSite({ ...baseInput, siteUrl: "https://x.example/" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("BingService.listSitesForUserWithGrantStatus", () => {
  beforeEach(() => {
    mocks.state.selectRows = [
      { id: "grant-a", accountId: "uid-a" },
      { id: "grant-b", accountId: "uid-b" },
    ];
    resetClientMocks();
    mocks.createBingClient.mockClear();
    mocks.dbDelete.mockClear();
  });

  it("lists grants independently and never deletes a dead grant", async () => {
    mocks.listSites.mockImplementation(
      async ({ bingAccountId }: { bingAccountId?: string }) => {
        if (bingAccountId === "uid-b") throw new mocks.BingTokenError();
        return [verifiedSite];
      },
    );
    const { BingService } = await import("./BingService");

    await expect(
      BingService.listSitesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      accounts: [
        {
          accountId: "uid-a",
          email: "owner@example.com",
          requiresReconnect: false,
          sites: [verifiedSite],
        },
        {
          accountId: "uid-b",
          email: null,
          requiresReconnect: true,
          sites: [],
        },
      ],
    });
    expect(mocks.createBingClient).toHaveBeenCalledTimes(2);
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("marks a grant for reconnect on a Bing 403 without deleting it", async () => {
    mocks.state.selectRows = [{ id: "grant-a", accountId: "uid-a" }];
    mocks.listSites.mockRejectedValue(
      new mocks.BingApiError(403, "Bing Webmaster denied access"),
    );
    const { BingService } = await import("./BingService");

    await expect(
      BingService.listSitesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      accounts: [
        { accountId: "uid-a", email: null, requiresReconnect: true, sites: [] },
      ],
    });
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("keeps non-auth Bing API errors reportable", async () => {
    const rateLimit = new mocks.BingApiError(429, "slow down");
    mocks.listSites.mockImplementation(
      async ({ bingAccountId }: { bingAccountId?: string }) => {
        if (bingAccountId === "uid-b") throw rateLimit;
        return [verifiedSite];
      },
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { BingService } = await import("./BingService");

    await expect(
      BingService.listSitesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      accounts: [
        {
          accountId: "uid-a",
          email: "owner@example.com",
          requiresReconnect: false,
          sites: [verifiedSite],
        },
        {
          accountId: "uid-b",
          email: null,
          requiresReconnect: true,
          sites: [],
        },
      ],
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to list Bing Webmaster sites for grant",
      "grant-b",
      rateLimit,
    );
    expect(mocks.dbDelete).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("BingService.getPerformance", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockReset();
    mocks.getRankAndTrafficStats.mockReset().mockResolvedValue([]);
    mocks.createBingClient.mockClear();
  });

  it("throws BingNotConnectedError when the project has no connection", async () => {
    mocks.getByProjectId.mockResolvedValue(null);
    const { BingService, BingNotConnectedError } =
      await import("./BingService");

    await expect(
      BingService.getPerformance({ projectId: "p1" }),
    ).rejects.toBeInstanceOf(BingNotConnectedError);
    expect(mocks.createBingClient).not.toHaveBeenCalled();
  });

  it("uses the grant stored on the project connection and passes rows through", async () => {
    const rows = [{ Date: "2026-01-01T00:00:00.000Z", Impressions: 5 }];
    mocks.getByProjectId.mockResolvedValue({
      connectedByUserId: "u1",
      connectedAccountEmail: "a@example.com",
      bingAccountId: "uid-a",
      siteUrl: "https://x.example/",
      authMode: "oauth",
    });
    mocks.getRankAndTrafficStats.mockResolvedValue(rows);
    const { BingService } = await import("./BingService");

    await expect(
      BingService.getPerformance({ projectId: "p1" }),
    ).resolves.toEqual({
      siteUrl: "https://x.example/",
      connectedBy: "a@example.com",
      rows,
    });
    expect(mocks.createBingClient).toHaveBeenCalledWith({
      userId: "u1",
      bingAccountId: "uid-a",
    });
  });

  it("passes undefined for a null-account connection", async () => {
    mocks.getByProjectId.mockResolvedValue({
      connectedByUserId: "u1",
      connectedAccountEmail: "owner@example.com",
      bingAccountId: null,
      siteUrl: "https://x.example/",
      authMode: "oauth",
    });
    const { BingService } = await import("./BingService");

    await BingService.getPerformance({ projectId: "p1" });

    expect(mocks.createBingClient).toHaveBeenCalledWith({
      userId: "u1",
      bingAccountId: undefined,
    });
  });

  it("rejects api_key connections with a clear AppError", async () => {
    mocks.getByProjectId.mockResolvedValue({
      connectedByUserId: "u1",
      connectedAccountEmail: "owner@example.com",
      bingAccountId: null,
      siteUrl: "https://x.example/",
      authMode: "api_key",
    });
    const { BingService } = await import("./BingService");

    await expect(
      BingService.getPerformance({ projectId: "p1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mocks.createBingClient).not.toHaveBeenCalled();
  });
});
