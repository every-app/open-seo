import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listSearchConsoleSitesTool,
  setSearchConsoleSiteTool,
} from "./google-connection-tools";
import { makeToolContext } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  GscService: {
    listSitesForUserWithGrantStatus: vi.fn(),
    getConnection: vi.fn(),
    setSite: vi.fn(),
  },
}));

vi.mock("cloudflare:workers", () => ({
  env: {},
  waitUntil: (promise: Promise<unknown>) => promise,
}));
vi.mock("@/server/lib/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/server/email/onboarding-drip", () => ({
  markOnboardingMilestone: vi.fn(),
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: mocks.GscService,
}));
vi.mock("@/server/features/ga4/services/Ga4Service", () => ({
  Ga4Service: {},
}));

const toolContext = makeToolContext();

const gscAccount = (accountId: string) => ({
  accountId,
  email: null,
  requiresReconnect: false,
  propertiesUnavailable: false,
  apiDisabled: false,
  sites: [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }],
});

const setSiteArgs = {
  projectId: "project_1",
  siteUrl: "sc-domain:example.com",
  gscAccountId: "acct_b",
};

describe("Google connection MCP tools", () => {
  beforeEach(() => {
    mocks.getProjectForOrganization.mockResolvedValue({ id: "project_1" });
    mocks.GscService.listSitesForUserWithGrantStatus.mockResolvedValue({
      accounts: [gscAccount("acct_a"), gscAccount("acct_b")],
    });
    mocks.GscService.setSite.mockResolvedValue({
      siteUrl: "sc-domain:example.com",
      connectedAccountEmail: null,
    });
  });

  it("flags only the site bound to the project, on the bound account", async () => {
    mocks.GscService.getConnection.mockResolvedValue({
      siteUrl: "sc-domain:example.com",
      gscAccountId: "acct_b",
    });

    const result = await listSearchConsoleSitesTool.handler(
      { projectId: "project_1" },
      toolContext,
    );

    expect(
      result.structuredContent.accounts.map(
        (account) => account.sites[0]?.isSelected,
      ),
    ).toEqual([false, true]);
  });

  it("binds the project through the requested Google account", async () => {
    const result = await setSearchConsoleSiteTool.handler(
      setSiteArgs,
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

  it("rejects a member-role caller before touching the connection", async () => {
    await expect(
      setSearchConsoleSiteTool.handler(
        setSiteArgs,
        makeToolContext({ role: "member" }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.GscService.setSite).not.toHaveBeenCalled();
  });
});
