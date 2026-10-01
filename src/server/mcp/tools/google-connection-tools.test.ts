import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  listGoogleAnalyticsPropertiesTool,
  setGoogleAnalyticsPropertyTool,
} from "./ga4-connection-tools";
import {
  listSearchConsoleSitesTool,
  setSearchConsoleSiteTool,
} from "./gsc-connection-tools";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  GscService: {
    listSitesForUserWithGrantStatus: vi.fn(),
    getConnection: vi.fn(),
    setSite: vi.fn(),
  },
  Ga4Service: {
    listPropertiesForUserWithGrantStatus: vi.fn(),
    getConnection: vi.fn(),
    setProperty: vi.fn(),
  },
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: mocks.GscService,
}));
vi.mock("@/server/features/ga4/services/Ga4Service", () => ({
  Ga4Service: mocks.Ga4Service,
}));

const toolContext = makeToolContext();

const gscAccount = (accountId: string, siteUrls: string[]) => ({
  accountId,
  email: `${accountId}@example.com`,
  requiresReconnect: false,
  propertiesUnavailable: false,
  sites: siteUrls.map((siteUrl) => ({
    siteUrl,
    permissionLevel: "siteRestrictedUser",
  })),
});

const ga4Account = (accountId: string, propertyIds: string[]) => ({
  accountId,
  email: `${accountId}@example.com`,
  requiresReconnect: false,
  propertiesUnavailable: false,
  properties: propertyIds.map((propertyId) => ({
    propertyId,
    displayName: `Property ${propertyId}`,
    accountDisplayName: "Account",
  })),
});

describe("Google connection MCP tools", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
    mocks.GscService.getConnection.mockResolvedValue(null);
    mocks.Ga4Service.getConnection.mockResolvedValue(null);
  });

  it("lists sites per Google account and stamps the accountId on every entry", async () => {
    mocks.GscService.listSitesForUserWithGrantStatus.mockResolvedValue({
      accounts: [
        gscAccount("acct_a", ["sc-domain:example.com"]),
        gscAccount("acct_b", ["https://other.com/"]),
      ],
    });

    const result = await listSearchConsoleSitesTool.handler({}, toolContext);

    expect(
      mocks.GscService.listSitesForUserWithGrantStatus,
    ).toHaveBeenCalledWith("user_123");
    expect(result.structuredContent?.accounts).toMatchObject([
      { accountId: "acct_a", sites: [{ accountId: "acct_a" }] },
      { accountId: "acct_b", sites: [{ accountId: "acct_b" }] },
    ]);
  });

  it("flags the site bound to the project when a projectId is given", async () => {
    mocks.GscService.listSitesForUserWithGrantStatus.mockResolvedValue({
      accounts: [
        gscAccount("acct_a", ["sc-domain:example.com"]),
        gscAccount("acct_b", ["sc-domain:example.com"]),
      ],
    });
    mocks.GscService.getConnection.mockResolvedValue({
      siteUrl: "sc-domain:example.com",
      gscAccountId: "acct_b",
    });

    const result = await listSearchConsoleSitesTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(
      result.structuredContent?.accounts.map(
        (account) => account.sites[0]?.isSelected,
      ),
    ).toEqual([false, true]);
  });

  it("binds the project with the requested Google account", async () => {
    mocks.GscService.setSite.mockResolvedValue({
      siteUrl: "sc-domain:example.com",
      connectedAccountEmail: "marketing@example.com",
    });

    const result = await setSearchConsoleSiteTool.handler(
      {
        projectId: "project_1",
        siteUrl: "sc-domain:example.com",
        gscAccountId: "acct_b",
      },
      toolContext,
    );

    expect(mocks.GscService.setSite).toHaveBeenCalledWith({
      projectId: "project_1",
      organizationId: "org_123",
      siteUrl: "sc-domain:example.com",
      accountId: "acct_b",
      userId: "user_123",
    });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      gscAccountId: "acct_b",
    });
  });

  it("picks the only account that can see the site when gscAccountId is omitted", async () => {
    mocks.GscService.listSitesForUserWithGrantStatus.mockResolvedValue({
      accounts: [
        gscAccount("acct_a", ["https://other.com/"]),
        gscAccount("acct_b", ["sc-domain:example.com"]),
      ],
    });
    mocks.GscService.setSite.mockResolvedValue({
      siteUrl: "sc-domain:example.com",
      connectedAccountEmail: null,
    });

    await setSearchConsoleSiteTool.handler(
      { projectId: "project_1", siteUrl: "sc-domain:example.com" },
      toolContext,
    );

    expect(mocks.GscService.setSite).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: "acct_b" }),
    );
  });

  it("refuses to guess when several accounts can see the site", async () => {
    mocks.GscService.listSitesForUserWithGrantStatus.mockResolvedValue({
      accounts: [
        gscAccount("acct_a", ["sc-domain:example.com"]),
        gscAccount("acct_b", ["sc-domain:example.com"]),
      ],
    });

    await expect(
      setSearchConsoleSiteTool.handler(
        { projectId: "project_1", siteUrl: "sc-domain:example.com" },
        toolContext,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.GscService.setSite).not.toHaveBeenCalled();
  });

  it("does not let a member-role caller change a project's Google connection", async () => {
    await expect(
      setSearchConsoleSiteTool.handler(
        {
          projectId: "project_1",
          siteUrl: "sc-domain:example.com",
          gscAccountId: "acct_a",
        },
        makeToolContext({ role: "member" }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.GscService.setSite).not.toHaveBeenCalled();
  });

  it("lists GA4 properties per Google account with the accountId on every entry", async () => {
    mocks.Ga4Service.listPropertiesForUserWithGrantStatus.mockResolvedValue({
      accounts: [ga4Account("acct_a", ["properties/1"])],
    });

    const result = await listGoogleAnalyticsPropertiesTool.handler(
      {},
      toolContext,
    );

    expect(result.structuredContent?.accounts).toMatchObject([
      {
        accountId: "acct_a",
        properties: [{ accountId: "acct_a", propertyId: "properties/1" }],
      },
    ]);
  });

  it("normalizes a bare numeric GA4 property id and binds it with the requested account", async () => {
    mocks.Ga4Service.setProperty.mockResolvedValue({
      propertyId: "properties/277096348",
      propertyDisplayName: "Example",
      propertyTimeZone: "America/Los_Angeles",
      propertyCurrencyCode: "USD",
      connectedAccountEmail: "marketing@example.com",
    });

    // The MCP SDK parses input against the tool schema before the handler
    // runs; do the same so the id normalization is what the handler sees.
    const args = z
      .object(setGoogleAnalyticsPropertyTool.config.inputSchema)
      .parse({
        projectId: "project_1",
        propertyId: "277096348",
        ga4AccountId: "acct_b",
      });
    const result = await setGoogleAnalyticsPropertyTool.handler(
      args,
      toolContext,
    );

    expect(mocks.Ga4Service.setProperty).toHaveBeenCalledWith({
      projectId: "project_1",
      organizationId: "org_123",
      propertyId: "properties/277096348",
      accountId: "acct_b",
      userId: "user_123",
    });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      ga4AccountId: "acct_b",
      propertyId: "properties/277096348",
    });
  });
});
