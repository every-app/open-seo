import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class BingNotConnectedError extends Error {}
  return {
    BingNotConnectedError,
    getConnection: vi.fn(),
    userHasGrant: vi.fn(),
    listSitesForUserWithGrantStatus: vi.fn(),
    setSite: vi.fn(),
    disconnect: vi.fn(),
    getKeywords: vi.fn(),
    hasBingOAuthConfig: vi.fn(),
    captureServerEvent: vi.fn(),
    waitUntil: vi.fn(),
  };
});

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
// `env` too, not just waitUntil: the module graph now reaches d1/client.ts
// via the self-hosted OAuth flow, which reads env.DB at import time.
vi.mock("cloudflare:workers", () => ({ waitUntil: mocks.waitUntil, env: {} }));
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
    getKeywords: mocks.getKeywords,
  },
  BingNotConnectedError: mocks.BingNotConnectedError,
  isExpectedGrantFailure: () => false,
}));
vi.mock("@/server/features/bing/oauth-config", () => ({
  hasBingOAuthConfig: mocks.hasBingOAuthConfig,
}));
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));
import {
  disconnectBing,
  getBingConnection,
  getBingKeywords,
  listBingSites,
  setBingSite,
} from "./bing";

// The mocked createServerFn returns the raw handler, so each export is called
// with the context (and data) the middleware would have injected. These are
// pre-declared variables — not object literals — so the extra `context` field
// is accepted against the fetcher's declared options type.
const projectContext = {
  userId: "u1",
  userEmail: "u1@example.com",
  organizationId: "org1",
  projectId: "p1",
  role: "owner" as const,
};
const projectOpts = { data: { projectId: "p1" }, context: projectContext };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasBingOAuthConfig.mockResolvedValue(false);
  mocks.userHasGrant.mockResolvedValue(false);
  mocks.getConnection.mockResolvedValue(null);
  mocks.listSitesForUserWithGrantStatus.mockResolvedValue({ accounts: [] });
  mocks.getKeywords.mockResolvedValue({
    siteUrl: "https://x.example/",
    connectedBy: null,
    rows: [],
  });
  mocks.captureServerEvent.mockResolvedValue(undefined);
});

describe("getBingConnection", () => {
  it("does not advertise OAuth when the deployment has no Bing credentials", async () => {
    mocks.hasBingOAuthConfig.mockResolvedValue(false);

    await expect(getBingConnection(projectOpts)).resolves.toEqual({
      connected: false,
      currentUserHasGrant: false,
      bingOAuthConfigured: false,
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

describe("getBingKeywords", () => {
  it("returns sampled keyword rows from the project-scoped service", async () => {
    const rows = [
      {
        query: "open source seo",
        date: "2026-01-01T00:00:00.000Z",
        clicks: 1,
        impressions: 10,
        averageClickPosition: 4,
        averageImpressionPosition: 8,
      },
    ];
    mocks.getKeywords.mockResolvedValue({
      siteUrl: "https://x.example/",
      connectedBy: "owner@example.com",
      rows,
    });

    await expect(getBingKeywords(projectOpts)).resolves.toEqual({
      connected: true,
      siteUrl: "https://x.example/",
      connectedBy: "owner@example.com",
      rows,
    });
    expect(mocks.getKeywords).toHaveBeenCalledWith({ projectId: "p1" });
  });

  it("returns disconnected when the project has no Bing site", async () => {
    mocks.getKeywords.mockRejectedValue(new mocks.BingNotConnectedError());

    await expect(getBingKeywords(projectOpts)).resolves.toEqual({
      connected: false,
    });
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

  it("rejects members before changing the project-wide integration", async () => {
    const setOpts = {
      data: {
        projectId: "p1",
        accountId: "uid-a",
        siteUrl: "https://x.example/",
      },
      context: { ...projectContext, role: "member" as const },
    };

    await expect(setBingSite(setOpts)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.setSite).not.toHaveBeenCalled();
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

  it("rejects members before disconnecting the project-wide integration", async () => {
    const memberOpts = {
      ...projectOpts,
      context: { ...projectContext, role: "member" as const },
    };

    await expect(disconnectBing(memberOpts)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });
});
