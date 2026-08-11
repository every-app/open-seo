import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSelfHostedGoogleAuthorizationUrl,
  GA4_INTEGRATION,
  GSC_INTEGRATION,
  handleSelfHostedGoogleOAuthCallback,
  type SelfHostedGoogleOAuthIntegration,
} from "./selfHostedOAuth";

const mocks = vi.hoisted(() => ({
  getGoogleOAuthClientConfig: vi.fn(),
  hasSelfHostedGoogleOAuthConfig: vi.fn(),
  fetch: vi.fn(),
  selectLimit: vi.fn(),
  insertValues: vi.fn(),
  updateSet: vi.fn(),
  getAuth: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: (...values: unknown[]) => values,
}));
vi.mock("@/db/schema", () => ({
  account: {
    id: "id",
    userId: "userId",
    providerId: "providerId",
    accountId: "accountId",
  },
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: mocks.selectLimit }) }),
    }),
    insert: () => ({ values: mocks.insertValues }),
    update: () => ({
      set: mocks.updateSet.mockReturnValue({ where: vi.fn() }),
    }),
  },
}));
vi.mock("@/lib/auth", () => ({ getAuth: mocks.getAuth }));
vi.mock("@/server/features/google/oauth-config", () => ({
  getGoogleOAuthClientConfig: mocks.getGoogleOAuthClientConfig,
  hasSelfHostedGoogleOAuthConfig: mocks.hasSelfHostedGoogleOAuthConfig,
}));

const user = { userId: "user-1", userEmail: "user@example.com" };
const publicOrigin = "http://localhost:3001";
const callbackURL = `${publicOrigin}/p/project/settings`;

async function authorizationState(
  integration: SelfHostedGoogleOAuthIntegration,
) {
  const url = new URL(
    await createSelfHostedGoogleAuthorizationUrl({
      integration,
      user,
      callbackURL,
      publicOrigin,
    }),
  );
  return url.searchParams.get("state")!;
}

function callbackRequest(
  integration: SelfHostedGoogleOAuthIntegration,
  state: string,
  params: Record<string, string>,
) {
  const url = new URL(integration.callbackPath, publicOrigin);
  url.searchParams.set("state", state);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url);
}

describe("self-hosted Google OAuth providers", () => {
  beforeEach(() => {
    mocks.getGoogleOAuthClientConfig.mockResolvedValue({
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
    });
    mocks.hasSelfHostedGoogleOAuthConfig.mockResolvedValue(true);
    mocks.selectLimit.mockResolvedValue([]);
    mocks.insertValues.mockResolvedValue(undefined);
    mocks.getAuth.mockReturnValue({
      $context: Promise.resolve({
        options: { account: { encryptOAuthTokens: false } },
        secretConfig: "secret",
      }),
    });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps GSC and GA4 callback paths and scopes isolated", async () => {
    const common = { user, callbackURL, publicOrigin };
    const gscUrl = new URL(
      await createSelfHostedGoogleAuthorizationUrl({
        integration: GSC_INTEGRATION,
        ...common,
      }),
    );
    const ga4Url = new URL(
      await createSelfHostedGoogleAuthorizationUrl({
        integration: GA4_INTEGRATION,
        ...common,
      }),
    );

    expect(gscUrl.searchParams.get("redirect_uri")).toBe(
      `${publicOrigin}/api/gsc/oauth/callback`,
    );
    expect(ga4Url.searchParams.get("redirect_uri")).toBe(
      `${publicOrigin}/api/ga4/oauth/callback`,
    );
    expect(gscUrl.searchParams.get("scope")).toContain("webmasters.readonly");
    expect(ga4Url.searchParams.get("scope")).toContain("analytics.readonly");
    expect(gscUrl.searchParams.get("state")).not.toBe(
      ga4Url.searchParams.get("state"),
    );
  });

  it("round-trips signed state, exchanges the code, and persists the GA4 grant", async () => {
    const state = await authorizationState(GA4_INTEGRATION);
    const idToken = `header.${btoa(JSON.stringify({ sub: "google-account-1" }))}.signature`;
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
          scope: "openid analytics.readonly",
          id_token: idToken,
        }),
        { status: 200 },
      ),
    );

    const response = await handleSelfHostedGoogleOAuthCallback({
      integration: GA4_INTEGRATION,
      request: callbackRequest(GA4_INTEGRATION, state, { code: "code-1" }),
      user,
      publicOrigin,
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/p/project/settings");
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: "google-account-1",
        providerId: "google-analytics",
        userId: "user-1",
        accessToken: "access-token",
        refreshToken: "refresh-token",
      }),
    );
  });

  it.each(["tampered", "expired"])(
    "rejects %s state before token exchange",
    async (kind) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-07T12:00:00Z"));
      let state = await authorizationState(GA4_INTEGRATION);
      if (kind === "tampered") state = `${state.slice(0, -1)}x`;
      else vi.setSystemTime(new Date("2026-08-07T12:11:00Z"));

      await expect(
        handleSelfHostedGoogleOAuthCallback({
          integration: GA4_INTEGRATION,
          request: callbackRequest(GA4_INTEGRATION, state, { code: "code-1" }),
          user,
          publicOrigin,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(mocks.insertValues).not.toHaveBeenCalled();
    },
  );

  it("handles a provider denial without exchanging or persisting credentials", async () => {
    const state = await authorizationState(GA4_INTEGRATION);
    const response = await handleSelfHostedGoogleOAuthCallback({
      integration: GA4_INTEGRATION,
      request: callbackRequest(GA4_INTEGRATION, state, {
        error: "access_denied",
      }),
      user,
      publicOrigin,
    });

    expect(response.status).toBe(303);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("round-trips the GSC integration through the shared callback", async () => {
    const state = await authorizationState(GSC_INTEGRATION);
    const idToken = `header.${btoa(JSON.stringify({ sub: "gsc-account-1" }))}.signature`;
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "gsc-token", id_token: idToken }),
        { status: 200 },
      ),
    );

    const response = await handleSelfHostedGoogleOAuthCallback({
      integration: GSC_INTEGRATION,
      request: callbackRequest(GSC_INTEGRATION, state, { code: "gsc-code" }),
      user,
      publicOrigin,
    });

    expect(response.status).toBe(303);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "google-search-console",
        accountId: "gsc-account-1",
        accessToken: "gsc-token",
      }),
    );
  });
});
