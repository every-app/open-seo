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
    getConnectedEmail,
    createBingClient: vi.fn((opts: BingClientOptions) => ({
      listSites: () => listSites(opts),
      getRankAndTrafficStats: () => getRankAndTrafficStats(opts),
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

function collectSqlParams(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  if ("value" in value && "encoder" in value) {
    return [value.value];
  }
  if (!("queryChunks" in value) || !Array.isArray(value.queryChunks)) return [];
  return value.queryChunks.flatMap(collectSqlParams);
}

describe("BingService.disconnect", () => {
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
      bingAccountId: "uid-b",
    });
    mocks.existsForConnectorAccount.mockResolvedValue(false);
    const { BingService } = await import("./BingService");

    await BingService.disconnect({ projectId: "p1", userId: "u1" });

    expect(mocks.deleteByProjectId).toHaveBeenCalledWith("p1");
    expect(mocks.existsForConnectorAccount).toHaveBeenCalledWith("u1", "uid-b");
    expect(mocks.dbDelete).toHaveBeenCalledTimes(1);
    const whereCondition = mocks.deleteWhere.mock.calls[0]?.[0];
    expect(collectSqlParams(whereCondition)).toEqual(
      expect.arrayContaining(["u1", "bing-webmaster", "uid-b"]),
    );
  });

  it("keeps the grant when the same account powers another project", async () => {
    mocks.getByProjectId.mockResolvedValue({
      connectedByUserId: "u1",
      bingAccountId: "uid-b",
    });
    mocks.existsForConnectorAccount.mockResolvedValue(true);
    const { BingService } = await import("./BingService");

    await BingService.disconnect({ projectId: "p1", userId: "u1" });

    expect(mocks.deleteByProjectId).toHaveBeenCalledWith("p1");
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("never revokes a grant when another member disconnects", async () => {
    mocks.getByProjectId.mockResolvedValue({
      connectedByUserId: "owner",
      bingAccountId: "uid-b",
    });
    const { BingService } = await import("./BingService");

    await BingService.disconnect({ projectId: "p1", userId: "other-member" });

    expect(mocks.existsForConnectorAccount).not.toHaveBeenCalled();
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("deletes no grants for a null-account connection", async () => {
    mocks.getByProjectId.mockResolvedValue({
      connectedByUserId: "u1",
      bingAccountId: null,
    });
    const { BingService } = await import("./BingService");

    await BingService.disconnect({ projectId: "p1", userId: "u1" });

    expect(mocks.deleteByProjectId).toHaveBeenCalledWith("p1");
    expect(mocks.existsForConnectorAccount).not.toHaveBeenCalled();
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("deletes no grants when no site was bound", async () => {
    mocks.getByProjectId.mockResolvedValue(null);
    const { BingService } = await import("./BingService");

    await BingService.disconnect({ projectId: "p1", userId: "u1" });

    expect(mocks.existsForConnectorAccount).not.toHaveBeenCalled();
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });
});

describe("isExpectedGrantFailure", () => {
  it("treats token failures and 401/403 API errors as expected", async () => {
    const { isExpectedGrantFailure } = await import("./BingService");

    expect(isExpectedGrantFailure(new mocks.BingTokenError())).toBe(true);
    expect(
      isExpectedGrantFailure(new mocks.BingApiError(401, "unauthorized")),
    ).toBe(true);
    expect(
      isExpectedGrantFailure(new mocks.BingApiError(403, "forbidden")),
    ).toBe(true);
  });

  it("keeps other failures unexpected", async () => {
    const { isExpectedGrantFailure } = await import("./BingService");

    expect(
      isExpectedGrantFailure(new mocks.BingApiError(500, "server error")),
    ).toBe(false);
    expect(isExpectedGrantFailure(new Error("boom"))).toBe(false);
  });
});
