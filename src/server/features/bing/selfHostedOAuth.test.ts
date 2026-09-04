import { beforeEach, describe, expect, it, vi } from "vitest";

const CLIENT_SECRET = "bing-client-secret";
const ORIGIN = "https://openseo.example";
const CALLBACK_URI = `${ORIGIN}/api/bing/oauth/callback`;

const mocks = vi.hoisted(() => {
  const state: {
    existingRows: Array<{ id: string; refreshToken: string | null }>;
    config: { clientId: string; clientSecret: string } | null;
    selfHostedConfigured: boolean;
  } = {
    existingRows: [],
    config: { clientId: "bing-client-id", clientSecret: "bing-client-secret" },
    selfHostedConfigured: true,
  };

  const insertValues = vi.fn();
  const updateSet = vi.fn(() => ({
    where: vi.fn().mockResolvedValue(undefined),
  }));

  return {
    state,
    insertValues,
    updateSet,
    dbSelect: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue(state.existingRows),
        })),
      })),
    })),
    dbInsert: vi.fn(() => ({ values: insertValues })),
    dbUpdate: vi.fn(() => ({ set: updateSet })),
    fetch: vi.fn<typeof fetch>(),
  };
});

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/db", () => ({
  db: {
    select: mocks.dbSelect,
    insert: mocks.dbInsert,
    update: mocks.dbUpdate,
  },
}));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({
    $context: Promise.resolve({
      // Tokens are stored verbatim here so assertions can read them; the
      // encrypted path is Better Auth's own and is exercised by GSC.
      options: { account: { encryptOAuthTokens: false } },
      secretConfig: "test-secret",
    }),
  }),
}));
vi.mock("./oauth-config", () => ({
  getBingOAuthClientConfig: () => Promise.resolve(mocks.state.config),
  hasBingOAuthConfig: () => Promise.resolve(mocks.state.selfHostedConfigured),
}));

const user = { userId: "user_1", userEmail: "owner@example.com" };

/** Base64url JSON, the shape Bing's access tokens actually take. */
function bingAccessToken(claims: Record<string, unknown>) {
  const bytes = new TextEncoder().encode(JSON.stringify(claims));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

const VALID_TOKEN = bingAccessToken({
  webmasteruid: "WEBMASTER_UID_1",
  webmasteremail: "owner@example.com",
});

function tokenResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status });
}

/** Drive the real authorize step to obtain a genuinely signed state, so the
 *  callback tests exercise verification rather than a hand-made string. */
async function signedStateFor(callbackURL = `${ORIGIN}/p/p1/settings`) {
  const { createSelfHostedBingAuthorizationUrl } =
    await import("./selfHostedOAuth");
  const url = await createSelfHostedBingAuthorizationUrl({
    user,
    callbackURL,
    publicOrigin: ORIGIN,
  });
  const state = new URL(url).searchParams.get("state");
  if (!state) throw new Error("no state issued");
  return state;
}

function callbackRequest(params: Record<string, string>) {
  const url = new URL(CALLBACK_URI);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url);
}

describe("createSelfHostedBingAuthorizationUrl", () => {
  beforeEach(() => {
    mocks.state.config = {
      clientId: "bing-client-id",
      clientSecret: CLIENT_SECRET,
    };
    mocks.state.selfHostedConfigured = true;
  });

  it("builds a Bing consent URL with this deployment's callback", async () => {
    const { createSelfHostedBingAuthorizationUrl } =
      await import("./selfHostedOAuth");

    const url = new URL(
      await createSelfHostedBingAuthorizationUrl({
        user,
        callbackURL: `${ORIGIN}/p/p1/settings`,
        publicOrigin: ORIGIN,
      }),
    );

    expect(url.origin + url.pathname).toBe(
      "https://www.bing.com/webmasters/oauth/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("bing-client-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("Webmaster.read");
    // Bing permits one redirect URI per client; it must be this exact path.
    expect(url.searchParams.get("redirect_uri")).toBe(CALLBACK_URI);
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  it("refuses to start when the deployment is not configured", async () => {
    mocks.state.selfHostedConfigured = false;
    const { createSelfHostedBingAuthorizationUrl } =
      await import("./selfHostedOAuth");

    await expect(
      createSelfHostedBingAuthorizationUrl({
        user,
        callbackURL: `${ORIGIN}/p/p1/settings`,
        publicOrigin: ORIGIN,
      }),
    ).rejects.toMatchObject({ code: "AUTH_CONFIG_MISSING" });
  });
});

describe("handleSelfHostedBingOAuthCallback", () => {
  beforeEach(() => {
    mocks.state.config = {
      clientId: "bing-client-id",
      clientSecret: CLIENT_SECRET,
    };
    mocks.state.selfHostedConfigured = true;
    mocks.state.existingRows = [];
    mocks.insertValues.mockReset();
    mocks.updateSet.mockClear();
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("rejects a request with no state", async () => {
    const { handleSelfHostedBingOAuthCallback } =
      await import("./selfHostedOAuth");

    const response = await handleSelfHostedBingOAuthCallback({
      request: callbackRequest({ code: "abc" }),
      user,
      publicOrigin: ORIGIN,
    });

    expect(response.status).toBe(400);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects a tampered state rather than trusting its payload", async () => {
    const state = await signedStateFor();
    const [payload] = state.split(".");
    const { handleSelfHostedBingOAuthCallback } =
      await import("./selfHostedOAuth");

    await expect(
      handleSelfHostedBingOAuthCallback({
        request: callbackRequest({ code: "abc", state: `${payload}.forged` }),
        user,
        publicOrigin: ORIGIN,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("refuses a state issued for a different user", async () => {
    const state = await signedStateFor();
    const { handleSelfHostedBingOAuthCallback } =
      await import("./selfHostedOAuth");

    const response = await handleSelfHostedBingOAuthCallback({
      request: callbackRequest({ code: "abc", state }),
      user: { userId: "someone_else", userEmail: "other@example.com" },
      publicOrigin: ORIGIN,
    });

    expect(response.status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("sends a denied consent back to the app without exchanging anything", async () => {
    const state = await signedStateFor(`${ORIGIN}/p/p1/settings`);
    const { handleSelfHostedBingOAuthCallback } =
      await import("./selfHostedOAuth");

    const response = await handleSelfHostedBingOAuthCallback({
      request: callbackRequest({ error: "access_denied", state }),
      user,
      publicOrigin: ORIGIN,
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/p/p1/settings");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("never redirects off-origin, even if the caller asked it to", async () => {
    // The signed state is built from the caller's callbackURL; an off-origin
    // one must collapse to "/" rather than become an open redirect.
    const state = await signedStateFor("https://evil.example/steal");
    mocks.fetch.mockResolvedValue(
      tokenResponse({ access_token: VALID_TOKEN, expires_in: 3600 }),
    );
    const { handleSelfHostedBingOAuthCallback } =
      await import("./selfHostedOAuth");

    const response = await handleSelfHostedBingOAuthCallback({
      request: callbackRequest({ code: "abc", state }),
      user,
      publicOrigin: ORIGIN,
    });

    expect(response.headers.get("Location")).toBe("/");
  });

  it("stores the grant keyed by webmasteruid and returns to the app", async () => {
    const state = await signedStateFor(`${ORIGIN}/p/p1/settings`);
    mocks.fetch.mockResolvedValue(
      tokenResponse({
        access_token: VALID_TOKEN,
        refresh_token: "refresh-1",
        expires_in: 3600,
        scope: "Read",
      }),
    );
    const { handleSelfHostedBingOAuthCallback } =
      await import("./selfHostedOAuth");

    const response = await handleSelfHostedBingOAuthCallback({
      request: callbackRequest({ code: "abc", state }),
      user,
      publicOrigin: ORIGIN,
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/p/p1/settings");
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "bing-webmaster",
        userId: "user_1",
        accountId: "WEBMASTER_UID_1",
        accessToken: VALID_TOKEN,
        refreshToken: "refresh-1",
      }),
    );
    expect(mocks.fetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("keeps the stored refresh token when Bing returns none", async () => {
    // Bing does not rotate: refreshes come back without a refresh_token, so a
    // re-link must not null out the one already stored.
    mocks.state.existingRows = [{ id: "acct_1", refreshToken: "stored-token" }];
    const state = await signedStateFor();
    mocks.fetch.mockResolvedValue(
      tokenResponse({ access_token: VALID_TOKEN, expires_in: 3600 }),
    );
    const { handleSelfHostedBingOAuthCallback } =
      await import("./selfHostedOAuth");

    await handleSelfHostedBingOAuthCallback({
      request: callbackRequest({ code: "abc", state }),
      user,
      publicOrigin: ORIGIN,
    });

    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: "stored-token" }),
    );
  });

  it("surfaces a rejected code exchange rather than storing a partial grant", async () => {
    const state = await signedStateFor();
    mocks.fetch.mockResolvedValue(tokenResponse({ error: "bad code" }, 400));
    const { handleSelfHostedBingOAuthCallback } =
      await import("./selfHostedOAuth");

    await expect(
      handleSelfHostedBingOAuthCallback({
        request: callbackRequest({ code: "abc", state }),
        user,
        publicOrigin: ORIGIN,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("rejects an oversized token response before parsing or storing it", async () => {
    const state = await signedStateFor();
    mocks.fetch.mockResolvedValue(
      new Response(new Uint8Array(64 * 1024 + 1), { status: 200 }),
    );
    const { handleSelfHostedBingOAuthCallback } =
      await import("./selfHostedOAuth");

    await expect(
      handleSelfHostedBingOAuthCallback({
        request: callbackRequest({ code: "abc", state }),
        user,
        publicOrigin: ORIGIN,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("fails closed when the token exchange cannot be reached in time", async () => {
    const state = await signedStateFor();
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    mocks.fetch.mockRejectedValue(timeout);
    const { handleSelfHostedBingOAuthCallback } =
      await import("./selfHostedOAuth");

    await expect(
      handleSelfHostedBingOAuthCallback({
        request: callbackRequest({ code: "abc", state }),
        user,
        publicOrigin: ORIGIN,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("refuses an access token it cannot read an account id from", async () => {
    const state = await signedStateFor();
    mocks.fetch.mockResolvedValue(
      tokenResponse({ access_token: "opaque-token", expires_in: 3600 }),
    );
    const { handleSelfHostedBingOAuthCallback } =
      await import("./selfHostedOAuth");

    await expect(
      handleSelfHostedBingOAuthCallback({
        request: callbackRequest({ code: "abc", state }),
        user,
        publicOrigin: ORIGIN,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });
});
