/* eslint-disable max-lines */
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class GscApiError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = "GscApiError";
    }
  }

  class GscTokenError extends Error {
    constructor(message = "token unavailable") {
      super(message);
      this.name = "GscTokenError";
    }
  }

  const state: { selectRows: Array<{ id: string; accountId: string }> } = {
    selectRows: [],
  };
  type GscClientOptions = { userId: string; gscAccountId?: string };
  type GscSite = { siteUrl: string; permissionLevel: string };
  const listSites = vi.fn<(opts: GscClientOptions) => Promise<GscSite[]>>();
  const getUserInfoEmail =
    vi.fn<(opts: GscClientOptions) => Promise<string | null>>();
  const querySearchAnalytics =
    vi.fn<(opts: GscClientOptions) => Promise<never[]>>();
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
    getUserInfoEmail,
    querySearchAnalytics,
    createGscClient: vi.fn((opts: GscClientOptions) => ({
      listSites: () => listSites(opts),
      getUserInfoEmail: () => getUserInfoEmail(opts),
      querySearchAnalytics: () => querySearchAnalytics(opts),
    })),
    upsert: vi.fn(),
    getByProjectId: vi.fn(),
    deleteByProjectId: vi.fn(),
    existsForConnectorAccount: vi.fn(),
    GscApiError,
    GscTokenError,
  };
});

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({
  db: { select: mocks.dbSelect, delete: mocks.dbDelete },
}));
vi.mock("@/server/lib/gscClient", () => ({
  createGscClient: mocks.createGscClient,
  GscApiError: mocks.GscApiError,
  GscTokenError: mocks.GscTokenError,
}));
vi.mock("@/server/features/gsc/repositories/GscConnectionRepository", () => ({
  GscConnectionRepository: {
    upsert: mocks.upsert,
    getByProjectId: mocks.getByProjectId,
    deleteByProjectId: mocks.deleteByProjectId,
    existsForConnectorAccount: mocks.existsForConnectorAccount,
  },
}));

const baseInput = {
  projectId: "p1",
  organizationId: "org1",
  accountId: "sub-a",
  userId: "u1",
};

function collectSqlParams(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  if ("value" in value && "encoder" in value) {
    return [value.value];
  }
  if (!("queryChunks" in value) || !Array.isArray(value.queryChunks)) return [];
  return value.queryChunks.flatMap(collectSqlParams);
}

describe("GscService.setSite", () => {
  beforeEach(() => {
    mocks.state.selectRows = [{ id: "grant-a", accountId: "sub-a" }];
    mocks.listSites.mockReset();
    mocks.getUserInfoEmail.mockReset();
    mocks.createGscClient.mockClear();
    mocks.upsert.mockReset();
  });

  it("upserts a verified property with the selected grant and userinfo email", async () => {
    mocks.listSites.mockResolvedValue([
      { siteUrl: "https://x/", permissionLevel: "siteOwner" },
    ]);
    mocks.getUserInfoEmail.mockResolvedValue("client@example.com");
    mocks.upsert.mockResolvedValue({ siteUrl: "https://x/" });
    const { GscService } = await import("./GscService");

    await GscService.setSite({ ...baseInput, siteUrl: "https://x/" });

    expect(mocks.createGscClient).toHaveBeenCalledWith({
      userId: "u1",
      gscAccountId: "sub-a",
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        siteUrl: "https://x/",
        connectedByUserId: "u1",
        gscAccountId: "sub-a",
        connectedAccountEmail: "client@example.com",
      }),
    );
  });

  it("re-saves with a null email when userinfo is unavailable", async () => {
    mocks.listSites.mockResolvedValue([
      { siteUrl: "https://x/", permissionLevel: "siteOwner" },
    ]);
    mocks.getUserInfoEmail.mockRejectedValue(new Error("userinfo unavailable"));
    mocks.upsert.mockResolvedValue({
      siteUrl: "https://x/",
      connectedAccountEmail: "previous@example.com",
    });
    const { GscService } = await import("./GscService");

    const result = await GscService.setSite({
      ...baseInput,
      siteUrl: "https://x/",
    });

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ connectedAccountEmail: null }),
    );
    expect(result).toMatchObject({
      connectedAccountEmail: "previous@example.com",
    });
  });

  it("rejects a Google sub that is not one of the caller's grants", async () => {
    const { GscService } = await import("./GscService");

    await expect(
      GscService.setSite({
        ...baseInput,
        accountId: "foreign-sub",
        siteUrl: "https://x/",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.createGscClient).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
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

  it("rejects a property not on the selected grant with NOT_FOUND", async () => {
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

describe("GscService.listSitesForUserWithGrantStatus", () => {
  beforeEach(() => {
    mocks.state.selectRows = [
      { id: "grant-a", accountId: "sub-a" },
      { id: "grant-b", accountId: "sub-b" },
    ];
    mocks.listSites.mockReset();
    mocks.getUserInfoEmail.mockReset();
    mocks.createGscClient.mockClear();
    mocks.dbDelete.mockClear();
  });

  it("lists grants independently and never deletes a dead grant", async () => {
    mocks.getUserInfoEmail.mockImplementation(
      async ({ gscAccountId }: { gscAccountId?: string }) =>
        `${gscAccountId}@example.com`,
    );
    mocks.listSites.mockImplementation(
      async ({ gscAccountId }: { gscAccountId?: string }) => {
        if (gscAccountId === "sub-b") throw new mocks.GscTokenError();
        return [{ siteUrl: "https://x/", permissionLevel: "siteOwner" }];
      },
    );
    const { GscService } = await import("./GscService");

    await expect(
      GscService.listSitesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      accounts: [
        {
          accountId: "sub-a",
          email: "sub-a@example.com",
          requiresReconnect: false,
          sites: [{ siteUrl: "https://x/", permissionLevel: "siteOwner" }],
        },
        {
          accountId: "sub-b",
          email: null,
          requiresReconnect: true,
          sites: [],
        },
      ],
    });
    expect(mocks.createGscClient).toHaveBeenCalledTimes(2);
    expect(mocks.getUserInfoEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ gscAccountId: "sub-b" }),
    );
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("keeps userinfo failures non-fatal", async () => {
    mocks.state.selectRows = [{ id: "grant-a", accountId: "sub-a" }];
    mocks.getUserInfoEmail.mockRejectedValue(new Error("userinfo unavailable"));
    mocks.listSites.mockResolvedValue([
      { siteUrl: "https://x/", permissionLevel: "siteOwner" },
    ]);
    const { GscService } = await import("./GscService");

    await expect(
      GscService.listSitesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      accounts: [
        {
          accountId: "sub-a",
          email: null,
          requiresReconnect: false,
          sites: [{ siteUrl: "https://x/", permissionLevel: "siteOwner" }],
        },
      ],
    });
  });

  it("marks a grant for reconnect on a GSC 403 without deleting it", async () => {
    mocks.state.selectRows = [{ id: "grant-a", accountId: "sub-a" }];
    mocks.getUserInfoEmail.mockResolvedValue("a@example.com");
    mocks.listSites.mockRejectedValue(
      new mocks.GscApiError(403, "Search Console denied access"),
    );
    const { GscService } = await import("./GscService");

    await expect(
      GscService.listSitesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      accounts: [
        {
          accountId: "sub-a",
          email: null,
          requiresReconnect: true,
          sites: [],
        },
      ],
    });
    expect(mocks.getUserInfoEmail).not.toHaveBeenCalled();
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("keeps non-auth GSC API errors reportable", async () => {
    mocks.getUserInfoEmail.mockImplementation(
      async ({ gscAccountId }: { gscAccountId?: string }) =>
        `${gscAccountId}@example.com`,
    );
    const rateLimit = new mocks.GscApiError(429, "slow down");
    mocks.listSites.mockImplementation(
      async ({ gscAccountId }: { gscAccountId?: string }) => {
        if (gscAccountId === "sub-b") throw rateLimit;
        return [{ siteUrl: "https://x/", permissionLevel: "siteOwner" }];
      },
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { GscService } = await import("./GscService");

    await expect(
      GscService.listSitesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      accounts: [
        {
          accountId: "sub-a",
          email: "sub-a@example.com",
          requiresReconnect: false,
          sites: [{ siteUrl: "https://x/", permissionLevel: "siteOwner" }],
        },
        {
          accountId: "sub-b",
          email: null,
          requiresReconnect: true,
          sites: [],
        },
      ],
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to list Search Console sites for account",
      "sub-b",
      rateLimit,
    );
    expect(mocks.dbDelete).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("GscService.getPerformance", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockReset();
    mocks.querySearchAnalytics.mockReset().mockResolvedValue([]);
    mocks.createGscClient.mockClear();
  });

  it("uses the grant stored on the project connection", async () => {
    mocks.getByProjectId.mockResolvedValue({
      connectedByUserId: "u1",
      connectedAccountEmail: "a@example.com",
      gscAccountId: "sub-a",
      siteUrl: "https://x/",
    });
    const { GscService } = await import("./GscService");

    await GscService.getPerformance({
      projectId: "p1",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });

    expect(mocks.createGscClient).toHaveBeenCalledWith({
      userId: "u1",
      gscAccountId: "sub-a",
    });
  });

  it("passes undefined for the legacy null-account fallback", async () => {
    mocks.getByProjectId.mockResolvedValue({
      connectedByUserId: "u1",
      connectedAccountEmail: null,
      gscAccountId: null,
      siteUrl: "https://x/",
    });
    const { GscService } = await import("./GscService");

    await GscService.getPerformance({
      projectId: "p1",
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });

    expect(mocks.createGscClient).toHaveBeenCalledWith({
      userId: "u1",
      gscAccountId: undefined,
    });
  });
});

describe("GscService.disconnect", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockReset();
    mocks.deleteByProjectId.mockReset().mockResolvedValue(undefined);
    mocks.existsForConnectorAccount.mockReset();
    mocks.dbDelete.mockClear();
    mocks.deleteWhere.mockClear();
  });

  it("unlinks only the disconnected account when it is no longer used", async () => {
    mocks.getByProjectId.mockResolvedValue({
      connectedByUserId: "u1",
      gscAccountId: "sub-b",
    });
    mocks.existsForConnectorAccount.mockResolvedValue(false);
    const { GscService } = await import("./GscService");

    await GscService.disconnect({ projectId: "p1", userId: "u1" });

    expect(mocks.deleteByProjectId).toHaveBeenCalledWith("p1");
    expect(mocks.existsForConnectorAccount).toHaveBeenCalledWith("u1", "sub-b");
    expect(mocks.dbDelete).toHaveBeenCalledTimes(1);
    const whereCondition = mocks.deleteWhere.mock.calls[0]?.[0];
    expect(collectSqlParams(whereCondition)).toEqual(
      expect.arrayContaining(["u1", "google-search-console", "sub-b"]),
    );
  });

  it("keeps the grant when the same account powers another project", async () => {
    mocks.getByProjectId.mockResolvedValue({
      connectedByUserId: "u1",
      gscAccountId: "sub-b",
    });
    mocks.existsForConnectorAccount.mockResolvedValue(true);
    const { GscService } = await import("./GscService");

    await GscService.disconnect({ projectId: "p1", userId: "u1" });

    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("never revokes a grant when another member disconnects", async () => {
    mocks.getByProjectId.mockResolvedValue({
      connectedByUserId: "owner",
      gscAccountId: "sub-b",
    });
    const { GscService } = await import("./GscService");

    await GscService.disconnect({ projectId: "p1", userId: "other-member" });

    expect(mocks.existsForConnectorAccount).not.toHaveBeenCalled();
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("deletes no grants for a legacy null-account connection", async () => {
    mocks.getByProjectId.mockResolvedValue({
      connectedByUserId: "u1",
      gscAccountId: null,
    });
    const { GscService } = await import("./GscService");

    await GscService.disconnect({ projectId: "p1", userId: "u1" });

    expect(mocks.deleteByProjectId).toHaveBeenCalledWith("p1");
    expect(mocks.existsForConnectorAccount).not.toHaveBeenCalled();
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("deletes no grants when no property was bound", async () => {
    mocks.getByProjectId.mockResolvedValue(null);
    const { GscService } = await import("./GscService");

    await GscService.disconnect({ projectId: "p1", userId: "u1" });

    expect(mocks.existsForConnectorAccount).not.toHaveBeenCalled();
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });
});
