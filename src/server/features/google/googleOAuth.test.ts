import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type * as OAuthModule from "./googleOAuth";

const mocks = vi.hoisted(() => ({
  getGoogleOAuthClientConfig: vi.fn(),
  hasGoogleOAuthConfig: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
  getAuth: vi.fn(),
  getGoogleAccountId:
    vi.fn<(idToken: string, clientId: string) => Promise<string>>(),
  resolveUserContextFromHeaders: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/auth", () => ({ getAuth: mocks.getAuth }));
vi.mock("./googleIdToken", () => ({
  getGoogleAccountId: mocks.getGoogleAccountId,
}));
vi.mock("@/middleware/ensure-user/resolve", () => ({
  resolveUserContextFromHeaders: mocks.resolveUserContextFromHeaders,
}));
vi.mock("@/server/features/google/oauth-config", () => ({
  getGoogleOAuthClientConfig: mocks.getGoogleOAuthClientConfig,
  hasGoogleOAuthConfig: mocks.hasGoogleOAuthConfig,
}));

// The state row and the grant upsert both need real SQL (partial unique index,
// delete ... returning), so the module runs against a libsql file.
let client: Client;
let oauth: typeof OAuthModule;
const directory = mkdtempSync(join(tmpdir(), "google-oauth-"));

function migrationStatements(file: string, include: (sql: string) => boolean) {
  return readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .filter(include)
    .join("\n");
}

beforeAll(async () => {
  client = createClient({ url: `file:${join(directory, "test.db")}` });
  vi.doMock("@/db", () => ({ db: drizzle(client) }));
  // `account` references `user`; libsql enforces foreign keys by default.
  await client.executeMultiple(
    "CREATE TABLE user (id text PRIMARY KEY); INSERT INTO user VALUES ('user-1'), ('user-2');",
  );
  await client.executeMultiple(
    migrationStatements(
      "drizzle/sqlite/0003_light_sage.sql",
      (sql) =>
        sql.includes("CREATE TABLE `account`") ||
        sql.includes("CREATE TABLE `verification`"),
    ),
  );
  await client.executeMultiple(
    migrationStatements("drizzle/sqlite/0054_famous_crystal.sql", (sql) =>
      sql.includes("CREATE UNIQUE INDEX"),
    ),
  );
  oauth = await import("./googleOAuth");
});

afterAll(() => {
  client.close();
  rmSync(directory, { recursive: true });
});

const userId = "user-1";
const publicOrigin = "http://localhost:3001";
const callbackURL = `${publicOrigin}/p/project/settings?tab=integrations`;
const idToken = "google-id-token";

async function authorizationUrl(
  integration: OAuthModule.GoogleOAuthIntegration,
  url = callbackURL,
) {
  return new URL(
    await oauth.createGoogleAuthorizationUrl({
      integration,
      userId,
      callbackURL: url,
      publicOrigin,
    }),
  );
}

async function authorizationState(
  integration: OAuthModule.GoogleOAuthIntegration,
  url = callbackURL,
) {
  return (await authorizationUrl(integration, url)).searchParams.get("state")!;
}

function callbackRequest(
  integration: OAuthModule.GoogleOAuthIntegration,
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

/** Drive the route handler as the given signed-in user. */
function callback(
  integration: OAuthModule.GoogleOAuthIntegration,
  state: string,
  params: Record<string, string>,
  asUserId = userId,
) {
  mocks.resolveUserContextFromHeaders.mockResolvedValue({ userId: asUserId });
  return oauth.handleGoogleOAuthCallbackRequest(
    callbackRequest(integration, state, params),
    integration,
  );
}

function tokenResponse(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status: 200 });
}

async function grants() {
  const result = await client.execute(
    "SELECT user_id, provider_id, account_id, access_token, refresh_token FROM account ORDER BY user_id",
  );
  return result.rows.map((row) => ({ ...row }));
}

describe("Google OAuth grants", () => {
  beforeEach(async () => {
    await client.executeMultiple(
      "DELETE FROM account; DELETE FROM verification;",
    );
    mocks.getGoogleOAuthClientConfig.mockResolvedValue({
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
    });
    mocks.hasGoogleOAuthConfig.mockResolvedValue(true);
    mocks.getGoogleAccountId.mockResolvedValue("google-account-1");
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

  it.each([
    ["https://evil.example/p", "/"],
    [`${publicOrigin}//evil.example/p`, "/"],
    [`${publicOrigin}/p/1?x=1#h`, "/p/1?x=1#h"],
  ])("reduces callbackURL %s to same-origin path %s", async (input, path) => {
    const state = await authorizationState(oauth.GA4_INTEGRATION, input);
    const response = await callback(oauth.GA4_INTEGRATION, state, {
      error: "access_denied",
    });
    const back = new URL(response.headers.get("Location")!, publicOrigin);
    expect(back.origin).toBe(publicOrigin);
    expect(`${back.pathname}${back.search}${back.hash}`).toBe(
      path === "/"
        ? "/?google_link_error=ga4&error=access_denied"
        : "/p/1?x=1&google_link_error=ga4&error=access_denied#h",
    );
  });

  it("exchanges the code with PKCE and persists the grant", async () => {
    const authorizeUrl = await authorizationUrl(oauth.GA4_INTEGRATION);
    const state = authorizeUrl.searchParams.get("state")!;
    mocks.fetch.mockResolvedValue(
      tokenResponse({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        id_token: idToken,
      }),
    );

    const response = await callback(oauth.GA4_INTEGRATION, state, {
      code: "code-1",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "/p/project/settings?tab=integrations",
    );
    const body = mocks.fetch.mock.calls[0][1]?.body;
    if (!(body instanceof URLSearchParams)) throw new Error("form body");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(body.get("code_verifier")!),
    );
    expect(Buffer.from(digest).toString("base64url")).toBe(
      authorizeUrl.searchParams.get("code_challenge"),
    );
    expect(mocks.getGoogleAccountId).toHaveBeenCalledWith(
      idToken,
      "google-client-id",
    );
    expect(await grants()).toEqual([
      {
        user_id: "user-1",
        provider_id: "google-analytics",
        account_id: "google-account-1",
        access_token: "access-token",
        refresh_token: "refresh-token",
      },
    ]);
  });

  it("stores one grant per user for a Google account and keeps the refresh token on re-consent", async () => {
    mocks.getGoogleAccountId.mockResolvedValue("shared-google-account");
    mocks.fetch.mockResolvedValue(
      tokenResponse({
        access_token: "first",
        refresh_token: "refresh-1",
        id_token: idToken,
      }),
    );
    await callback(
      oauth.GSC_INTEGRATION,
      await authorizationState(oauth.GSC_INTEGRATION),
      { code: "code-1" },
    );

    // Google omits the refresh token when the user already consented once.
    // A Response body reads once, so each exchange gets a fresh one.
    mocks.fetch.mockImplementation(async () =>
      tokenResponse({ access_token: "second", id_token: idToken }),
    );
    await callback(
      oauth.GSC_INTEGRATION,
      await authorizationState(oauth.GSC_INTEGRATION),
      { code: "code-2" },
    );
    const otherUserUrl = new URL(
      await oauth.createGoogleAuthorizationUrl({
        integration: oauth.GSC_INTEGRATION,
        userId: "user-2",
        callbackURL,
        publicOrigin,
      }),
    );
    await callback(
      oauth.GSC_INTEGRATION,
      otherUserUrl.searchParams.get("state")!,
      { code: "code-3" },
      "user-2",
    );

    expect(await grants()).toEqual([
      {
        user_id: "user-1",
        provider_id: "google-search-console",
        account_id: "shared-google-account",
        access_token: "second",
        refresh_token: "refresh-1",
      },
      {
        user_id: "user-2",
        provider_id: "google-search-console",
        account_id: "shared-google-account",
        access_token: "second",
        refresh_token: null,
      },
    ]);
  });

  it("updates a Google Ads grant in place on re-consent, keeping its refresh token", async () => {
    mocks.fetch.mockResolvedValue(
      tokenResponse({
        access_token: "first",
        refresh_token: "refresh-1",
        id_token: idToken,
      }),
    );
    await callback(
      oauth.GOOGLE_ADS_INTEGRATION,
      await authorizationState(oauth.GOOGLE_ADS_INTEGRATION),
      { code: "code-1" },
    );

    // The partial unique index does not cover google-ads rows, so nothing but
    // the grant code stops a second consent from adding a second row.
    mocks.fetch.mockImplementation(async () =>
      tokenResponse({ access_token: "second", id_token: idToken }),
    );
    await callback(
      oauth.GOOGLE_ADS_INTEGRATION,
      await authorizationState(oauth.GOOGLE_ADS_INTEGRATION),
      { code: "code-2" },
    );

    expect(await grants()).toEqual([
      {
        user_id: "user-1",
        provider_id: "google-ads",
        account_id: "google-account-1",
        access_token: "second",
        refresh_token: "refresh-1",
      },
    ]);
  });

  it.each(["network failure", "invalid token response", "invalid ID token"])(
    "returns %s to the connect page without storing a grant",
    async (failure) => {
      const state = await authorizationState(oauth.GA4_INTEGRATION);
      if (failure === "network failure") {
        mocks.fetch.mockRejectedValue(new Error("Network unavailable"));
      } else {
        mocks.fetch.mockResolvedValue(
          failure === "invalid token response"
            ? new Response("not-json", { status: 200 })
            : tokenResponse({
                access_token: "access-token",
                id_token: idToken,
              }),
        );
      }
      if (failure === "invalid ID token") {
        mocks.getGoogleAccountId.mockRejectedValue(new Error("Bad signature"));
      }

      const response = await callback(oauth.GA4_INTEGRATION, state, {
        code: "code-1",
      });

      expect(response.headers.get("Location")).toBe(
        "/p/project/settings?tab=integrations&google_link_error=ga4&error=oauth_code_verification_failed",
      );
      expect(await grants()).toEqual([]);
    },
  );

  it("returns a grant save failure to the connect page", async () => {
    const state = await authorizationState(oauth.GA4_INTEGRATION);
    mocks.fetch.mockResolvedValue(
      tokenResponse({ access_token: "access-token", id_token: idToken }),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await client.execute(
        "CREATE TRIGGER fail_insert BEFORE INSERT ON account BEGIN SELECT RAISE(ABORT, 'database unavailable'); END",
      );
      const response = await callback(oauth.GA4_INTEGRATION, state, {
        code: "code-1",
      });

      expect(response.headers.get("Location")).toBe(
        "/p/project/settings?tab=integrations&google_link_error=ga4&error=connection_save_failed",
      );
      expect(log).toHaveBeenCalledWith(
        "google.oauth.grant_save_failed",
        expect.objectContaining({ provider: "ga4" }),
      );
    } finally {
      await client.execute("DROP TRIGGER IF EXISTS fail_insert");
      log.mockRestore();
    }
  });

  it.each(["unknown", "expired", "other user", "already used"])(
    "sends %s state to /auth-error before token exchange",
    async (kind) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-07T12:00:00Z"));
      let state = await authorizationState(oauth.GA4_INTEGRATION);
      if (kind === "unknown") state = `${state.slice(0, -1)}x`;
      if (kind === "expired")
        vi.setSystemTime(new Date("2026-08-07T12:11:00Z"));
      if (kind === "already used") {
        await callback(oauth.GA4_INTEGRATION, state, {
          error: "access_denied",
        });
      }

      const response = await callback(
        oauth.GA4_INTEGRATION,
        state,
        { code: "code-1" },
        kind === "other user" ? "user-2" : userId,
      );

      expect(response.status).toBe(303);
      expect(response.headers.get("Location")).toBe(
        "/auth-error?error=state_mismatch",
      );
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(await grants()).toEqual([]);
    },
  );

  it("sweeps expired states when a new flow starts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-07T12:00:00Z"));
    await authorizationState(oauth.GA4_INTEGRATION);
    vi.setSystemTime(new Date("2026-08-07T12:11:00Z"));
    await authorizationState(oauth.GSC_INTEGRATION);

    const rows = await client.execute(
      "SELECT identifier LIKE 'google-link:gsc:%' AS is_gsc FROM verification",
    );
    expect(rows.rows.map((row) => row.is_gsc)).toEqual([1]);
  });
});
