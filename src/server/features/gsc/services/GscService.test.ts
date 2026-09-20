/* eslint-disable max-lines */
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GscApiError, GscTokenError } from "@/server/lib/gscErrors";
import { GscService } from "./GscService";

const mocks = vi.hoisted(() => {
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
  };
});

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({
  db: { select: mocks.dbSelect, delete: mocks.dbDelete },
}));
vi.mock("@/server/lib/gscClient", () => ({
  createGscClient: mocks.createGscClient,
}));
vi.mock("@/server/features/gsc/repositories/GscConnectionRepository", () => ({
  GscConnectionRepository: {
    upsert: mocks.upsert,
    getByProjectId: mocks.getByProjectId,
    deleteByProjectId: mocks.deleteByProjectId,
  },
}));

const baseInput = {
  projectId: "p1",
  organizationId: "org1",
  accountId: "sub-a",
  userId: "u1",
};

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

    await expect(
      GscService.setSite({ ...baseInput, siteUrl: "https://x/" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects a property not on the selected grant with NOT_FOUND", async () => {
    mocks.listSites.mockResolvedValue([
      { siteUrl: "https://x/", permissionLevel: "siteOwner" },
    ]);

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
        if (gscAccountId === "sub-b") throw new GscTokenError("revoked");
        return [{ siteUrl: "https://x/", permissionLevel: "siteOwner" }];
      },
    );

    await expect(
      GscService.listSitesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      accounts: [
        {
          accountId: "sub-a",
          email: "sub-a@example.com",
          requiresReconnect: false,
          propertiesUnavailable: false,
          sites: [{ siteUrl: "https://x/", permissionLevel: "siteOwner" }],
        },
        {
          accountId: "sub-b",
          email: null,
          requiresReconnect: true,
          propertiesUnavailable: false,
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

  it("keeps healthy accounts usable when another account hits a temporary API error", async () => {
    mocks.getUserInfoEmail.mockResolvedValue("a@example.com");
    mocks.listSites.mockImplementation(async ({ gscAccountId }) => {
      if (gscAccountId === "sub-b")
        throw new GscApiError(503, "Temporarily unavailable");
      return [{ siteUrl: "https://x/", permissionLevel: "siteOwner" }];
    });
    const result = await GscService.listSitesForUserWithGrantStatus("u1");
    expect(result.accounts[0]).toMatchObject({
      requiresReconnect: false,
      propertiesUnavailable: false,
      sites: [{ siteUrl: "https://x/" }],
    });
    expect(result.accounts[1]).toMatchObject({
      requiresReconnect: false,
      propertiesUnavailable: true,
      sites: [],
    });
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("keeps userinfo failures non-fatal", async () => {
    mocks.state.selectRows = [{ id: "grant-a", accountId: "sub-a" }];
    mocks.getUserInfoEmail.mockRejectedValue(new Error("userinfo unavailable"));
    mocks.listSites.mockResolvedValue([
      { siteUrl: "https://x/", permissionLevel: "siteOwner" },
    ]);

    await expect(
      GscService.listSitesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      accounts: [
        {
          accountId: "sub-a",
          email: null,
          requiresReconnect: false,
          propertiesUnavailable: false,
          sites: [{ siteUrl: "https://x/", permissionLevel: "siteOwner" }],
        },
      ],
    });
  });

  it("marks a grant for reconnect on a GSC 401 without deleting it", async () => {
    mocks.state.selectRows = [{ id: "grant-a", accountId: "sub-a" }];
    mocks.getUserInfoEmail.mockResolvedValue("a@example.com");
    mocks.listSites.mockRejectedValue(
      new GscApiError(401, "Search Console rejected the credentials"),
    );

    await expect(
      GscService.listSitesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      accounts: [
        {
          accountId: "sub-a",
          email: null,
          requiresReconnect: true,
          propertiesUnavailable: false,
          sites: [],
        },
      ],
    });
    expect(mocks.getUserInfoEmail).not.toHaveBeenCalled();
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  // A 403 is usually the Search Console API being disabled in the Cloud
  // project, which reconnecting cannot fix. Reported as a reconnect it left
  // self-hosters deleting and re-linking a perfectly healthy grant forever.
  it("reports a GSC 403 as a load failure rather than a dead grant", async () => {
    mocks.state.selectRows = [{ id: "grant-a", accountId: "sub-a" }];
    const apiDisabled = new GscApiError(
      403,
      "The Google Search Console API is not enabled",
      '{"error":{"errors":[{"reason":"accessNotConfigured"}]}}',
    );
    mocks.listSites.mockRejectedValue(apiDisabled);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      GscService.listSitesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      accounts: [
        {
          accountId: "sub-a",
          email: null,
          requiresReconnect: false,
          propertiesUnavailable: true,
          sites: [],
        },
      ],
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to list Search Console sites for account",
      "sub-a",
      apiDisabled,
    );
    expect(mocks.dbDelete).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("keeps non-auth GSC API errors reportable", async () => {
    mocks.getUserInfoEmail.mockImplementation(
      async ({ gscAccountId }: { gscAccountId?: string }) =>
        `${gscAccountId}@example.com`,
    );
    const rateLimit = new GscApiError(429, "slow down");
    mocks.listSites.mockImplementation(
      async ({ gscAccountId }: { gscAccountId?: string }) => {
        if (gscAccountId === "sub-b") throw rateLimit;
        return [{ siteUrl: "https://x/", permissionLevel: "siteOwner" }];
      },
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      GscService.listSitesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      accounts: [
        {
          accountId: "sub-a",
          email: "sub-a@example.com",
          requiresReconnect: false,
          propertiesUnavailable: false,
          sites: [{ siteUrl: "https://x/", permissionLevel: "siteOwner" }],
        },
        {
          accountId: "sub-b",
          email: null,
          requiresReconnect: false,
          propertiesUnavailable: true,
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
  it("disconnects only this project and leaves linked Google accounts intact", async () => {
    mocks.dbDelete.mockClear();
    await GscService.disconnect({ projectId: "p1" });
    expect(mocks.deleteByProjectId).toHaveBeenCalledWith("p1");
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });
});
