import { beforeEach, describe, expect, it, vi } from "vitest";
import { Ga4AdminApiError, Ga4TokenError } from "@/server/lib/ga4Errors";
import { Ga4Service } from "./Ga4Service";

const mocks = vi.hoisted(() => {
  const state: { grants: Array<{ id: string; accountId: string }> } = {
    grants: [],
  };
  const listProperties = vi.fn();
  const getProperty = vi.fn();
  const getUserInfoEmail = vi.fn();
  return {
    state,
    listProperties,
    getProperty,
    getUserInfoEmail,
    createGa4AdminClient: vi.fn(() => ({
      listProperties,
      getProperty,
      getUserInfoEmail,
    })),
    dbSelect: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const rows = state.grants;
          return Object.assign(Promise.resolve(rows), {
            limit: vi.fn().mockResolvedValue(rows),
          });
        }),
      })),
    })),
    upsert: vi.fn(),
    getByProjectId: vi.fn(),
  };
});

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({ db: { select: mocks.dbSelect } }));
vi.mock("@/server/lib/ga4Client", () => ({
  createGa4AdminClient: mocks.createGa4AdminClient,
}));
vi.mock("@/server/features/ga4/repositories/Ga4ConnectionRepository", () => ({
  Ga4ConnectionRepository: {
    upsert: mocks.upsert,
    getByProjectId: mocks.getByProjectId,
  },
}));

describe("Ga4Service", () => {
  beforeEach(() => {
    mocks.state.grants = [{ id: "grant-a", accountId: "sub-a" }];
  });

  it("verifies a freshly discovered property before persisting metadata", async () => {
    mocks.listProperties.mockResolvedValue([
      {
        propertyId: "properties/11",
        displayName: "Site A",
        accountDisplayName: "Agency",
      },
    ]);
    mocks.getProperty.mockResolvedValue({
      name: "properties/11",
      displayName: "Site A",
      timeZone: "America/New_York",
      currencyCode: "USD",
    });
    mocks.getUserInfoEmail.mockResolvedValue("client@example.com");
    mocks.upsert.mockResolvedValue({ propertyId: "properties/11" });
    const input = {
      projectId: "p1",
      organizationId: "org1",
      propertyId: "properties/11",
      accountId: "sub-a",
      userId: "u1",
    };

    await Ga4Service.setProperty(input);

    expect(mocks.upsert).toHaveBeenCalledWith({
      projectId: "p1",
      organizationId: "org1",
      propertyId: "properties/11",
      propertyDisplayName: "Site A",
      propertyTimeZone: "America/New_York",
      propertyCurrencyCode: "USD",
      connectedByUserId: "u1",
      ga4AccountId: "sub-a",
      connectedAccountEmail: "client@example.com",
    });

    // A userinfo failure is non-fatal: the email is passed through as null.
    mocks.getUserInfoEmail.mockRejectedValue(new Error("userinfo unavailable"));
    await Ga4Service.setProperty(input);
    expect(mocks.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ connectedAccountEmail: null }),
    );
  });

  it("rejects a property or connector the current user does not own", async () => {
    await expect(
      Ga4Service.setProperty({
        projectId: "p1",
        organizationId: "org1",
        propertyId: "properties/11",
        accountId: "foreign-sub",
        userId: "u1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    mocks.listProperties.mockResolvedValue([]);
    await expect(
      Ga4Service.setProperty({
        projectId: "p1",
        organizationId: "org1",
        propertyId: "properties/11",
        accountId: "sub-a",
        userId: "u1",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("distinguishes expired grants from inaccessible property discovery", async () => {
    mocks.state.grants = [
      { id: "grant-a", accountId: "sub-a" },
      { id: "grant-b", accountId: "sub-b" },
    ];
    mocks.listProperties
      .mockRejectedValueOnce(new Ga4TokenError("revoked"))
      .mockRejectedValueOnce(new Ga4AdminApiError(403, "forbidden"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      Ga4Service.listPropertiesForUserWithGrantStatus("u1"),
    ).resolves.toEqual({
      accounts: [
        {
          accountId: "sub-a",
          email: null,
          requiresReconnect: true,
          propertiesUnavailable: false,
          properties: [],
        },
        {
          accountId: "sub-b",
          email: null,
          requiresReconnect: false,
          propertiesUnavailable: true,
          properties: [],
        },
      ],
    });
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("ga4.property_discovery_failed", {
      errorName: "Ga4AdminApiError",
      status: 403,
    });
    consoleError.mockRestore();
  });
});
