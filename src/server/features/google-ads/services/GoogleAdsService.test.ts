import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GoogleAdsApiError,
  GoogleAdsConfigError,
} from "@/server/lib/googleAdsErrors";
import { GoogleAdsService } from "./GoogleAdsService";

const mocks = vi.hoisted(() => {
  const state: {
    grants: Array<{ id: string; accountId: string; scope: string | null }>;
  } = { grants: [] };
  const listAccessibleCustomers = vi.fn();
  const search = vi.fn();
  const getUserInfoEmail = vi.fn();
  return {
    state,
    listAccessibleCustomers,
    search,
    getUserInfoEmail,
    upsert: vi.fn(),
    deleteByProjectId: vi.fn(),
    createGoogleAdsClient: vi.fn(() => ({
      listAccessibleCustomers,
      search,
      getUserInfoEmail,
    })),
    dbSelect: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(state.grants)),
      })),
    })),
  };
});

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({ db: { select: mocks.dbSelect } }));
vi.mock("@/server/lib/googleAdsClient", () => ({
  createGoogleAdsClient: mocks.createGoogleAdsClient,
}));
vi.mock(
  "@/server/features/google-ads/repositories/GoogleAdsConnectionRepository",
  () => ({
    GoogleAdsConnectionRepository: {
      upsert: mocks.upsert,
      deleteByProjectId: mocks.deleteByProjectId,
    },
  }),
);

/** A `SELECT ... FROM customer` answer for one customer. */
const customerRow = (
  id: string,
  overrides: Record<string, unknown> = {},
): unknown => ({ customer: { id, ...overrides } });

describe("GoogleAdsService.listAccountsForUserWithGrantStatus", () => {
  beforeEach(() => {
    mocks.state.grants = [
      { id: "grant_1", accountId: "google-sub-1", scope: "openid,adwords" },
    ];
    mocks.getUserInfoEmail.mockResolvedValue("tony@example.com");
    mocks.listAccessibleCustomers.mockResolvedValue([]);
    mocks.search.mockResolvedValue([]);
  });

  it("reports a grant with no accessible customers without error flags", async () => {
    const result =
      await GoogleAdsService.listAccountsForUserWithGrantStatus("user_1");
    expect(result.accounts).toEqual([
      {
        accountId: "google-sub-1",
        email: "tony@example.com",
        requiresReconnect: false,
        accessPending: false,
        setupRequired: false,
        accountsUnavailable: false,
        truncated: false,
        accounts: [],
      },
    ]);
  });

  it("separates a missing developer token from Google-side approval latency", async () => {
    mocks.listAccessibleCustomers.mockRejectedValue(new GoogleAdsConfigError());
    const result =
      await GoogleAdsService.listAccountsForUserWithGrantStatus("user_1");
    expect(result.accounts[0]).toMatchObject({
      setupRequired: true,
      accessPending: false,
      accountsUnavailable: false,
    });
  });

  it("classifies a developer-token failure on per-customer probes as access pending", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue(["1111111111"]);
    mocks.search.mockRejectedValue(
      new GoogleAdsApiError(
        403,
        "not approved",
        "DEVELOPER_TOKEN_NOT_APPROVED",
      ),
    );
    const result =
      await GoogleAdsService.listAccountsForUserWithGrantStatus("user_1");
    expect(result.accounts[0]).toMatchObject({
      accessPending: true,
      accountsUnavailable: false,
      accounts: [],
    });
  });

  it("classifies an unapproved-for-production Cloud project as access pending", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue(["1111111111"]);
    mocks.search.mockRejectedValue(
      new GoogleAdsApiError(
        403,
        "Google Ads API access not approved for production accounts",
        "CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION",
      ),
    );
    const result =
      await GoogleAdsService.listAccountsForUserWithGrantStatus("user_1");
    expect(result.accounts[0]).toMatchObject({
      accessPending: true,
      accountsUnavailable: false,
      accounts: [],
    });
  });

  it("surfaces accounts-unavailable when every accessible customer fails its probe", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue([
      "1111111111",
      "2222222222",
    ]);
    mocks.search.mockRejectedValue(
      new GoogleAdsApiError(403, "denied", "USER_PERMISSION_DENIED"),
    );
    const result =
      await GoogleAdsService.listAccountsForUserWithGrantStatus("user_1");
    expect(result.accounts[0]).toMatchObject({
      accessPending: false,
      accountsUnavailable: true,
      accounts: [],
    });
  });

  it("keeps enabled non-manager clients from any depth under a manager", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue(["9999999999"]);
    let clientQuery = "";
    let clientLogin: string | null | undefined;
    mocks.search.mockImplementation(
      (
        customerId: string,
        query: string,
        options?: { loginCustomerId?: string | null },
      ) => {
        if (query.includes("FROM customer_client")) {
          clientQuery = query;
          clientLogin = options?.loginCustomerId;
          return Promise.resolve([
            {
              customerClient: {
                clientCustomer: "customers/1234567890",
                descriptiveName: "LSA Account",
                currencyCode: "USD",
              },
            },
            {
              customerClient: {
                clientCustomer: "customers/8888888888",
                manager: true,
              },
            },
          ]);
        }
        if (query.includes("FROM customer")) {
          return Promise.resolve([
            { customer: { id: customerId, manager: true } },
          ]);
        }
        // Local Services campaign probe.
        return Promise.resolve([{ campaign: { id: "42" } }]);
      },
    );
    const result =
      await GoogleAdsService.listAccountsForUserWithGrantStatus("user_1");
    expect(clientQuery).toContain("customer_client.level >= 1");
    expect(clientLogin).toBe("9999999999");
    expect(result.accounts[0].accounts).toEqual([
      {
        customerId: "1234567890",
        loginCustomerId: "9999999999",
        descriptiveName: "LSA Account",
        currencyCode: "USD",
        timeZone: null,
        hasLocalServicesCampaigns: true,
      },
    ]);
  });

  it("lists an account once when a manager and direct access both reach it", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue([
      "9999999999",
      "1234567890",
    ]);
    mocks.search.mockImplementation((customerId: string, query: string) => {
      if (query.includes("FROM customer_client")) {
        return Promise.resolve([
          { customerClient: { clientCustomer: "customers/1234567890" } },
        ]);
      }
      if (query.includes("FROM customer")) {
        return Promise.resolve([
          customerRow(customerId, { manager: customerId === "9999999999" }),
        ]);
      }
      return Promise.resolve([]);
    });
    const result =
      await GoogleAdsService.listAccountsForUserWithGrantStatus("user_1");
    // Direct access wins: reporting through it needs no login-customer-id.
    expect(result.accounts[0].accounts).toMatchObject([
      { customerId: "1234567890", loginCustomerId: null },
    ]);
  });

  it("flags a grant whose account list was cut short by the discovery bound", async () => {
    mocks.listAccessibleCustomers.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => `100000000${i}`),
    );
    mocks.search.mockImplementation((customerId: string, query: string) =>
      Promise.resolve(
        query.includes("FROM customer") ? [customerRow(customerId)] : [],
      ),
    );
    const result =
      await GoogleAdsService.listAccountsForUserWithGrantStatus("user_1");
    expect(result.accounts[0]).toMatchObject({ truncated: true });
    expect(result.accounts[0].accounts).toHaveLength(10);
  });
});

describe("GoogleAdsService.setAccount", () => {
  const selection = {
    projectId: "project_1",
    organizationId: "org_1",
    accountId: "google-sub-1",
    customerId: "1234567890",
    loginCustomerId: "9999999999",
    userId: "user_1",
  };

  beforeEach(() => {
    mocks.state.grants = [
      { id: "grant_1", accountId: "google-sub-1", scope: "openid,adwords" },
    ];
    mocks.getUserInfoEmail.mockResolvedValue("tony@example.com");
    mocks.listAccessibleCustomers.mockResolvedValue(["9999999999"]);
    mocks.search.mockResolvedValue([
      customerRow("1234567890", {
        descriptiveName: "LSA Account",
        currencyCode: "CAD",
      }),
    ]);
    mocks.upsert.mockImplementation((input: unknown) => Promise.resolve(input));
  });

  it("verifies only the chosen account rather than re-running discovery", async () => {
    await GoogleAdsService.setAccount(selection);
    // One customer lookup — not a probe per accessible account.
    expect(mocks.search).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "1234567890",
        loginCustomerId: "9999999999",
        customerDescriptiveName: "LSA Account",
        currencyCode: "CAD",
      }),
    );
  });

  it("refuses a login-customer-id the grant cannot reach", async () => {
    await expect(
      GoogleAdsService.setAccount({
        ...selection,
        loginCustomerId: "7777777777",
      }),
    ).rejects.toThrow(/isn't available/);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
