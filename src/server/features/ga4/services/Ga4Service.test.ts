/* eslint-disable max-lines */
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class Ga4ApiError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
      this.name = "Ga4ApiError";
    }
  }

  class Ga4TokenError extends Error {
    constructor(message = "token unavailable") {
      super(message);
      this.name = "Ga4TokenError";
    }
  }

  const state: { selectRows: Array<{ id: string; accountId: string }> } = {
    selectRows: [],
  };
  type Ga4ClientOptions = { userId: string; ga4AccountId?: string };
  type Ga4AccountSummary = {
    account: string;
    displayName: string;
    propertySummaries: Array<{
      property: string;
      displayName: string;
      parent: string;
    }>;
  };
  const listAccountSummaries =
    vi.fn<(opts: Ga4ClientOptions) => Promise<Ga4AccountSummary[]>>();
  const getUserInfoEmail =
    vi.fn<(opts: Ga4ClientOptions) => Promise<string | null>>();
  const runReport = vi.fn<(opts: Ga4ClientOptions) => Promise<unknown>>();
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
    listAccountSummaries,
    getUserInfoEmail,
    runReport,
    createGa4Client: vi.fn((opts: Ga4ClientOptions) => ({
      listAccountSummaries: () => listAccountSummaries(opts),
      getUserInfoEmail: () => getUserInfoEmail(opts),
      runReport: () => runReport(opts),
    })),
    upsert: vi.fn(),
    getByProjectId: vi.fn(),
    deleteByProjectId: vi.fn(),
    existsForConnectorAccount: vi.fn(),
    Ga4ApiError,
    Ga4TokenError,
  };
});

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({
  db: { select: mocks.dbSelect, delete: mocks.dbDelete },
}));
vi.mock("@/server/lib/ga4Client", () => ({
  createGa4Client: mocks.createGa4Client,
  Ga4ApiError: mocks.Ga4ApiError,
  Ga4TokenError: mocks.Ga4TokenError,
}));
vi.mock("@/server/features/ga4/repositories/Ga4ConnectionRepository", () => ({
  Ga4ConnectionRepository: {
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

describe("Ga4Service.setProperty", () => {
  beforeEach(() => {
    mocks.state.selectRows = [{ id: "grant-a", accountId: "sub-a" }];
    mocks.listAccountSummaries.mockReset();
    mocks.getUserInfoEmail.mockReset();
    mocks.createGa4Client.mockClear();
    mocks.upsert.mockReset();
  });

  it("upserts the selected property with the selected grant and userinfo email", async () => {
    mocks.listAccountSummaries.mockResolvedValue([
      {
        account: "accounts/1",
        displayName: "My Org",
        propertySummaries: [
          {
            property: "properties/123",
            displayName: "example.com",
            parent: "accounts/1",
          },
        ],
      },
    ]);
    mocks.getUserInfoEmail.mockResolvedValue("client@example.com");
    mocks.upsert.mockResolvedValue({ propertyId: "properties/123" });
    const { Ga4Service } = await import("./Ga4Service");

    await Ga4Service.setProperty({ ...baseInput, propertyId: "properties/123" });

    expect(mocks.createGa4Client).toHaveBeenCalledWith({
      userId: "u1",
      ga4AccountId: "sub-a",
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "p1",
        propertyId: "properties/123",
        propertyDisplayName: "example.com",
        connectedByUserId: "u1",
        ga4AccountId: "sub-a",
        connectedAccountEmail: "client@example.com",
      }),
    );
  });

  it("re-saves with a null email when userinfo is unavailable", async () => {
    mocks.listAccountSummaries.mockResolvedValue([
      {
        account: "accounts/1",
        displayName: "My Org",
        propertySummaries: [
          {
            property: "properties/123",
            displayName: "example.com",
            parent: "accounts/1",
          },
        ],
      },
    ]);
    mocks.getUserInfoEmail.mockRejectedValue(new Error("userinfo unavailable"));
    mocks.upsert.mockResolvedValue({
      propertyId: "properties/123",
      connectedAccountEmail: "previous@example.com",
    });
    const { Ga4Service } = await import("./Ga4Service");

    const result = await Ga4Service.setProperty({
      ...baseInput,
      propertyId: "properties/123",
    });

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ connectedAccountEmail: null }),
    );
    expect(result).toMatchObject({
      connectedAccountEmail: "previous@example.com",
    });
  });

  it("rejects a Google sub that is not one of the caller's grants", async () => {
    const { Ga4Service } = await import("./Ga4Service");

    await expect(
      Ga4Service.setProperty({
        ...baseInput,
        accountId: "foreign-sub",
        propertyId: "properties/123",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.createGa4Client).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects a property not on the selected grant with NOT_FOUND", async () => {
    mocks.listAccountSummaries.mockResolvedValue([
      {
        account: "accounts/1",
        displayName: "My Org",
        propertySummaries: [
          {
            property: "properties/123",
            displayName: "example.com",
            parent: "accounts/1",
          },
        ],
      },
    ]);
    const { Ga4Service } = await import("./Ga4Service");

    await expect(
      Ga4Service.setProperty({ ...baseInput, propertyId: "properties/999" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("Ga4Service.listPropertiesForUserWithGrantStatus", () => {
  beforeEach(() => {
    mocks.state.selectRows = [
      { id: "grant-a", accountId: "sub-a" },
      { id: "grant-b", accountId: "sub-b" },
    ];
    mocks.listAccountSummaries.mockReset();
    mocks.getUserInfoEmail.mockReset();
    mocks.createGa4Client.mockClear();
    mocks.dbDelete.mockClear();
    mocks.getByProjectId.mockReset().mockResolvedValue(null);
  });

  it("lists grants independently and never deletes a dead grant", async () => {
    mocks.getUserInfoEmail.mockImplementation(
      async ({ ga4AccountId }: { ga4AccountId?: string }) =>
        `${ga4AccountId}@example.com`,
    );
    mocks.listAccountSummaries.mockImplementation(
      async ({ ga4AccountId }: { ga4AccountId?: string }) => {
        if (ga4AccountId === "sub-b")
          throw new mocks.Ga4TokenError();
        return [
          {
            account: "accounts/1",
            displayName: "My Org",
            propertySummaries: [
              {
                property: "properties/123",
                displayName: "example.com",
                parent: "accounts/1",
              },
            ],
          },
        ];
      },
    );
    const { Ga4Service } = await import("./Ga4Service");

    await expect(
      Ga4Service.listPropertiesForUserWithGrantStatus("u1", "p1"),
    ).resolves.toEqual({
      accounts: [
        {
          accountId: "sub-a",
          email: "sub-a@example.com",
          requiresReconnect: false,
          properties: [
            {
              propertyId: "properties/123",
              displayName: "example.com",
              isSelected: false,
            },
          ],
        },
        {
          accountId: "sub-b",
          email: null,
          requiresReconnect: true,
          properties: [],
        },
      ],
    });
    expect(mocks.createGa4Client).toHaveBeenCalledTimes(2);
    expect(mocks.getUserInfoEmail).not.toHaveBeenCalledWith(
      expect.objectContaining({ ga4AccountId: "sub-b" }),
    );
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("marks the connected property as selected", async () => {
    mocks.state.selectRows = [{ id: "grant-a", accountId: "sub-a" }];
    mocks.getByProjectId.mockResolvedValue({ propertyId: "properties/123" });
    mocks.getUserInfoEmail.mockResolvedValue("a@example.com");
    mocks.listAccountSummaries.mockResolvedValue([
      {
        account: "accounts/1",
        displayName: "My Org",
        propertySummaries: [
          {
            property: "properties/123",
            displayName: "example.com",
            parent: "accounts/1",
          },
        ],
      },
    ]);
    const { Ga4Service } = await import("./Ga4Service");

    const result = await Ga4Service.listPropertiesForUserWithGrantStatus(
      "u1",
      "p1",
    );

    expect(result.accounts[0]?.properties[0]?.isSelected).toBe(true);
  });

  it("merges properties from multiple GA4 accounts under one grant into a single entry", async () => {
    mocks.state.selectRows = [{ id: "grant-a", accountId: "sub-a" }];
    mocks.getUserInfoEmail.mockResolvedValue("a@example.com");
    mocks.listAccountSummaries.mockResolvedValue([
      {
        account: "accounts/1",
        displayName: "Personal",
        propertySummaries: [
          {
            property: "properties/111",
            displayName: "personal-site.com",
            parent: "accounts/1",
          },
        ],
      },
      {
        account: "accounts/2",
        displayName: "Work",
        propertySummaries: [
          {
            property: "properties/222",
            displayName: "work-site.com",
            parent: "accounts/2",
          },
        ],
      },
    ]);
    const { Ga4Service } = await import("./Ga4Service");

    const result = await Ga4Service.listPropertiesForUserWithGrantStatus(
      "u1",
      "p1",
    );

    // One entry per grant, not per GA4 account — otherwise both entries would
    // share the same accountId (the grant's OAuth sub) and collide as
    // duplicate React keys in the property picker.
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]?.accountId).toBe("sub-a");
    expect(result.accounts[0]?.properties).toEqual([
      {
        propertyId: "properties/111",
        displayName: "personal-site.com",
        isSelected: false,
      },
      {
        propertyId: "properties/222",
        displayName: "work-site.com",
        isSelected: false,
      },
    ]);
  });

  it("keeps userinfo failures non-fatal", async () => {
    mocks.state.selectRows = [{ id: "grant-a", accountId: "sub-a" }];
    mocks.getUserInfoEmail.mockRejectedValue(new Error("userinfo unavailable"));
    mocks.listAccountSummaries.mockResolvedValue([
      {
        account: "accounts/1",
        displayName: "My Org",
        propertySummaries: [
          {
            property: "properties/123",
            displayName: "example.com",
            parent: "accounts/1",
          },
        ],
      },
    ]);
    const { Ga4Service } = await import("./Ga4Service");

    await expect(
      Ga4Service.listPropertiesForUserWithGrantStatus("u1", "p1"),
    ).resolves.toEqual({
      accounts: [
        {
          accountId: "sub-a",
          email: null,
          requiresReconnect: false,
          properties: [
            {
              propertyId: "properties/123",
              displayName: "example.com",
              isSelected: false,
            },
          ],
        },
      ],
    });
  });

  it("marks a grant for reconnect on a GA4 403 without deleting it", async () => {
    mocks.state.selectRows = [{ id: "grant-a", accountId: "sub-a" }];
    mocks.getUserInfoEmail.mockResolvedValue("a@example.com");
    mocks.listAccountSummaries.mockRejectedValue(
      new mocks.Ga4ApiError(403, "Analytics denied access"),
    );
    const { Ga4Service } = await import("./Ga4Service");

    await expect(
      Ga4Service.listPropertiesForUserWithGrantStatus("u1", "p1"),
    ).resolves.toEqual({
      accounts: [
        {
          accountId: "sub-a",
          email: null,
          requiresReconnect: true,
          properties: [],
        },
      ],
    });
    expect(mocks.getUserInfoEmail).not.toHaveBeenCalled();
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("keeps non-auth GA4 API errors reportable", async () => {
    mocks.getUserInfoEmail.mockImplementation(
      async ({ ga4AccountId }: { ga4AccountId?: string }) =>
        `${ga4AccountId}@example.com`,
    );
    const rateLimit = new mocks.Ga4ApiError(429, "slow down");
    mocks.listAccountSummaries.mockImplementation(
      async ({ ga4AccountId }: { ga4AccountId?: string }) => {
        if (ga4AccountId === "sub-b") throw rateLimit;
        return [
          {
            account: "accounts/1",
            displayName: "My Org",
            propertySummaries: [
              {
                property: "properties/123",
                displayName: "example.com",
                parent: "accounts/1",
              },
            ],
          },
        ];
      },
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { Ga4Service } = await import("./Ga4Service");

    await expect(
      Ga4Service.listPropertiesForUserWithGrantStatus("u1", "p1"),
    ).resolves.toEqual({
      accounts: [
        {
          accountId: "sub-a",
          email: "sub-a@example.com",
          requiresReconnect: false,
          properties: [
            {
              propertyId: "properties/123",
              displayName: "example.com",
              isSelected: false,
            },
          ],
        },
        {
          accountId: "sub-b",
          email: null,
          requiresReconnect: true,
          properties: [],
        },
      ],
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to list Analytics properties for account",
      "sub-b",
      rateLimit,
    );
    expect(mocks.dbDelete).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("Ga4Service.getPerformance", () => {
  beforeEach(() => {
    mocks.getByProjectId.mockReset();
    mocks.runReport.mockReset().mockResolvedValue({ rows: [] });
    mocks.createGa4Client.mockClear();
  });

  it("uses the grant stored on the project connection", async () => {
    mocks.getByProjectId.mockResolvedValue({
      connectedByUserId: "u1",
      connectedAccountEmail: "a@example.com",
      ga4AccountId: "sub-a",
      propertyId: "properties/123",
      propertyDisplayName: "example.com",
    });
    const { Ga4Service } = await import("./Ga4Service");

    await Ga4Service.getPerformance({
      projectId: "p1",
      metrics: ["sessions"],
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });

    expect(mocks.createGa4Client).toHaveBeenCalledWith({
      userId: "u1",
      ga4AccountId: "sub-a",
    });
  });

  it("passes undefined for the legacy null-account fallback", async () => {
    mocks.getByProjectId.mockResolvedValue({
      connectedByUserId: "u1",
      connectedAccountEmail: null,
      ga4AccountId: null,
      propertyId: "properties/123",
      propertyDisplayName: null,
    });
    const { Ga4Service } = await import("./Ga4Service");

    await Ga4Service.getPerformance({
      projectId: "p1",
      metrics: ["sessions"],
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });

    expect(mocks.createGa4Client).toHaveBeenCalledWith({
      userId: "u1",
      ga4AccountId: undefined,
    });
  });
});

describe("Ga4Service.disconnect", () => {
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
      ga4AccountId: "sub-b",
    });
    mocks.existsForConnectorAccount.mockResolvedValue(false);
    const { Ga4Service } = await import("./Ga4Service");

    await Ga4Service.disconnect({ projectId: "p1", userId: "u1" });

    expect(mocks.deleteByProjectId).toHaveBeenCalledWith("p1");
    expect(mocks.existsForConnectorAccount).toHaveBeenCalledWith("u1", "sub-b");
    expect(mocks.dbDelete).toHaveBeenCalledTimes(1);
    const whereCondition = mocks.deleteWhere.mock.calls[0]?.[0];
    expect(collectSqlParams(whereCondition)).toEqual(
      expect.arrayContaining(["u1", "google-analytics", "sub-b"]),
    );
  });

  it("keeps the grant when the same account powers another project", async () => {
    mocks.getByProjectId.mockResolvedValue({
      connectedByUserId: "u1",
      ga4AccountId: "sub-b",
    });
    mocks.existsForConnectorAccount.mockResolvedValue(true);
    const { Ga4Service } = await import("./Ga4Service");

    await Ga4Service.disconnect({ projectId: "p1", userId: "u1" });

    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("never revokes a grant when another member disconnects", async () => {
    mocks.getByProjectId.mockResolvedValue({
      connectedByUserId: "owner",
      ga4AccountId: "sub-b",
    });
    const { Ga4Service } = await import("./Ga4Service");

    await Ga4Service.disconnect({ projectId: "p1", userId: "other-member" });

    expect(mocks.existsForConnectorAccount).not.toHaveBeenCalled();
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("deletes no grants for a legacy null-account connection", async () => {
    mocks.getByProjectId.mockResolvedValue({
      connectedByUserId: "u1",
      ga4AccountId: null,
    });
    const { Ga4Service } = await import("./Ga4Service");

    await Ga4Service.disconnect({ projectId: "p1", userId: "u1" });

    expect(mocks.deleteByProjectId).toHaveBeenCalledWith("p1");
    expect(mocks.existsForConnectorAccount).not.toHaveBeenCalled();
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });

  it("deletes no grants when no property was bound", async () => {
    mocks.getByProjectId.mockResolvedValue(null);
    const { Ga4Service } = await import("./Ga4Service");

    await Ga4Service.disconnect({ projectId: "p1", userId: "u1" });

    expect(mocks.existsForConnectorAccount).not.toHaveBeenCalled();
    expect(mocks.dbDelete).not.toHaveBeenCalled();
  });
});
