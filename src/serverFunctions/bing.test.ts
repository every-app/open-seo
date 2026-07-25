import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  userHasGrant: vi.fn(),
  listSitesForUserWithGrantStatus: vi.fn(),
  setSite: vi.fn(),
  disconnect: vi.fn(),
  hasSelfHostedBingConfig: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
  captureServerEvent: vi.fn(),
  waitUntil: vi.fn(),
}));

// Reduce each server function to its bare handler so tests can invoke it with a
// synthetic context, exactly the shape the middleware would otherwise produce.
// `.handler(fn)` returns fn, and `.middleware`/`.validator` are chainable no-ops.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("cloudflare:workers", () => ({ waitUntil: mocks.waitUntil }));
vi.mock("@/serverFunctions/middleware", () => ({
  requireAuthenticatedContext: [],
  requireProjectContext: [],
}));
vi.mock("@/server/features/bing/services/BingService", () => ({
  BingService: {
    getConnection: mocks.getConnection,
    userHasGrant: mocks.userHasGrant,
    listSitesForUserWithGrantStatus: mocks.listSitesForUserWithGrantStatus,
    setSite: mocks.setSite,
    disconnect: mocks.disconnect,
  },
}));
vi.mock("@/server/features/bing/oauth-config", () => ({
  hasSelfHostedBingConfig: mocks.hasSelfHostedBingConfig,
}));
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHostedServerAuthMode,
}));

import {
  disconnectBing,
  getBingConnection,
  getBingGrantStatus,
  listBingSites,
  setBingSite,
} from "./bing";

// The mocked createServerFn returns the raw handler, so each export is called
// with the context (and data) the middleware would have injected. These are
// pre-declared variables — not object literals — so the extra `context` field
// is accepted against the fetcher's declared options type.
const authContext = { userId: "u1", userEmail: "u1@example.com" };
const projectContext = {
  userId: "u1",
  userEmail: "u1@example.com",
  organizationId: "org1",
  projectId: "p1",
};
const grantOpts = { data: undefined, context: authContext };
const projectOpts = { data: { projectId: "p1" }, context: projectContext };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isHostedServerAuthMode.mockResolvedValue(false);
  mocks.hasSelfHostedBingConfig.mockResolvedValue(false);
  mocks.userHasGrant.mockResolvedValue(false);
  mocks.getConnection.mockResolvedValue(null);
  mocks.listSitesForUserWithGrantStatus.mockResolvedValue({ accounts: [] });
  mocks.captureServerEvent.mockResolvedValue(undefined);
});

describe("getBingGrantStatus", () => {
  it("reports the account-level grant from BingService.userHasGrant", async () => {
    mocks.userHasGrant.mockResolvedValue(true);

    await expect(getBingGrantStatus(grantOpts)).resolves.toEqual({
      connected: true,
    });
    expect(mocks.userHasGrant).toHaveBeenCalledWith("u1");
  });
});

describe("getBingConnection", () => {
  it("reports bingOAuthConfigured in hosted mode even without self-hosted config", async () => {
    mocks.isHostedServerAuthMode.mockResolvedValue(true);
    mocks.hasSelfHostedBingConfig.mockResolvedValue(false);

    await expect(getBingConnection(projectOpts)).resolves.toEqual({
      connected: false,
      currentUserHasGrant: false,
      bingOAuthConfigured: true,
      siteUrl: null,
      connectedByEmail: null,
      connectedAt: null,
    });
  });

  it("surfaces the stored connection details when connected", async () => {
    mocks.getConnection.mockResolvedValue({
      bingAccountId: "uid-a",
      siteUrl: "https://x.example/",
      connectedAccountEmail: "owner@example.com",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    mocks.userHasGrant.mockResolvedValue(true);

    await expect(getBingConnection(projectOpts)).resolves.toEqual({
      connected: true,
      currentUserHasGrant: true,
      bingOAuthConfigured: false,
      siteUrl: "https://x.example/",
      connectedByEmail: "owner@example.com",
      connectedAt: "2026-01-01T00:00:00.000Z",
    });
  });
});

describe("listBingSites", () => {
  it("marks the connected site selected and an unverified site as not selectable", async () => {
    mocks.listSitesForUserWithGrantStatus.mockResolvedValue({
      accounts: [
        {
          accountId: "uid-a",
          email: "owner@example.com",
          requiresReconnect: false,
          sites: [
            {
              url: "https://x.example/",
              isVerified: true,
              authenticationCode: null,
              dnsVerificationCode: null,
            },
            {
              url: "https://unverified.example/",
              isVerified: false,
              authenticationCode: null,
              dnsVerificationCode: null,
            },
          ],
        },
      ],
    });
    mocks.getConnection.mockResolvedValue({
      bingAccountId: "uid-a",
      siteUrl: "https://x.example/",
    });

    await expect(listBingSites(projectOpts)).resolves.toEqual({
      accounts: [
        {
          accountId: "uid-a",
          email: "owner@example.com",
          requiresReconnect: false,
          sites: [
            {
              siteUrl: "https://x.example/",
              isVerified: true,
              selectable: true,
              isSelected: true,
            },
            {
              siteUrl: "https://unverified.example/",
              isVerified: false,
              selectable: false,
              isSelected: false,
            },
          ],
        },
      ],
    });
  });

  it("does not mark any site selected when the account id differs", async () => {
    mocks.listSitesForUserWithGrantStatus.mockResolvedValue({
      accounts: [
        {
          accountId: "uid-a",
          email: null,
          requiresReconnect: false,
          sites: [
            {
              url: "https://x.example/",
              isVerified: true,
              authenticationCode: null,
              dnsVerificationCode: null,
            },
          ],
        },
      ],
    });
    mocks.getConnection.mockResolvedValue({
      bingAccountId: "uid-b",
      siteUrl: "https://x.example/",
    });

    const result = await listBingSites(projectOpts);
    expect(result.accounts[0]?.sites[0]?.isSelected).toBe(false);
  });
});

describe("setBingSite", () => {
  it("passes the project and org through to BingService.setSite and reports the event", async () => {
    mocks.setSite.mockResolvedValue({ siteUrl: "https://x.example/" });
    const setOpts = {
      data: {
        projectId: "p1",
        accountId: "uid-a",
        siteUrl: "https://x.example/",
      },
      context: projectContext,
    };

    await expect(setBingSite(setOpts)).resolves.toEqual({
      connected: true,
      siteUrl: "https://x.example/",
    });

    expect(mocks.setSite).toHaveBeenCalledWith({
      projectId: "p1",
      organizationId: "org1",
      accountId: "uid-a",
      siteUrl: "https://x.example/",
      userId: "u1",
    });
    expect(mocks.waitUntil).toHaveBeenCalledTimes(1);
    expect(mocks.captureServerEvent).toHaveBeenCalledWith({
      distinctId: "u1",
      event: "bing:site_select",
      organizationId: "org1",
      properties: { project_id: "p1", site_url: "https://x.example/" },
    });
  });
});

describe("disconnectBing", () => {
  it("disconnects the project and returns { connected: false }", async () => {
    mocks.disconnect.mockResolvedValue(undefined);

    await expect(disconnectBing(projectOpts)).resolves.toEqual({
      connected: false,
    });

    expect(mocks.disconnect).toHaveBeenCalledWith({
      projectId: "p1",
      userId: "u1",
    });
    expect(mocks.captureServerEvent).toHaveBeenCalledWith({
      distinctId: "u1",
      event: "bing:disconnect",
      organizationId: "org1",
      properties: { project_id: "p1" },
    });
  });
});
