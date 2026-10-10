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
import type * as OAuthModule from "./bingOAuth";

const mocks = vi.hoisted(() => ({
  getBingOAuthClientConfig: vi.fn(),
  hasBingOAuthConfig: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
  getAuth: vi.fn(),
  resolveUserContextFromHeaders: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/lib/auth", () => ({ getAuth: mocks.getAuth }));
vi.mock("@/middleware/ensure-user/resolve", () => ({
  resolveUserContextFromHeaders: mocks.resolveUserContextFromHeaders,
}));
vi.mock("./oauth-config", () => ({
  getBingOAuthClientConfig: mocks.getBingOAuthClientConfig,
  hasBingOAuthConfig: mocks.hasBingOAuthConfig,
}));

// The state row and the grant upsert both need real SQL (partial unique index,
// delete ... returning), so the module runs against a libsql file.
let client: Client;
let oauth: typeof OAuthModule;
const directory = mkdtempSync(join(tmpdir(), "bing-oauth-"));

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
    migrationStatements("drizzle/sqlite/0055_bing_webmaster.sql", (sql) =>
      sql.includes("account_bing_grant_owner_idx"),
    ),
  );
  oauth = await import("./bingOAuth");
});

afterAll(() => {
  client.close();
  rmSync(directory, { recursive: true });
});

const userId = "user-1";
const publicOrigin = "http://localhost:3001";
const callbackURL = `${publicOrigin}/p/project/settings?tab=integrations`;
const redirectUri = `${publicOrigin}/api/bing/oauth/callback`;

async function authorizationUrl(url = callbackURL) {
  return new URL(
    await oauth.createBingAuthorizationUrl({
      userId,
      callbackURL: url,
      publicOrigin,
    }),
  );
}

async function authorizationState(url = callbackURL) {
  return (await authorizationUrl(url)).searchParams.get("state")!;
}

function callbackRequest(state: string, params: Record<string, string>) {
  const url = new URL("/api/bing/oauth/callback", publicOrigin);
  url.searchParams.set("state", state);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url);
}

/** Drive the route handler as the given signed-in user. */
function callback(
  state: string,
  params: Record<string, string>,
  asUserId = userId,
) {
  mocks.resolveUserContextFromHeaders.mockResolvedValue({ userId: asUserId });
  return oauth.handleBingOAuthCallbackRequest(callbackRequest(state, params));
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

describe("Bing OAuth grants", () => {
  beforeEach(async () => {
    await client.executeMultiple(
      "DELETE FROM account; DELETE FROM verification;",
    );
    mocks.getBingOAuthClientConfig.mockResolvedValue({
      clientId: "bing-client-id",
      clientSecret: "bing-client-secret",
    });
    mocks.hasBingOAuthConfig.mockResolvedValue(true);
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

  it("builds an exact-match authorization URL with the read-only scope", async () => {
    const url = await authorizationUrl();

    expect(url.origin).toBe("https://www.bing.com");
    expect(url.pathname).toBe("/webmasters/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("bing-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("webmaster.read");
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(url.searchParams.has("code_challenge")).toBe(false);
  });

  it.each([
    ["https://evil.example/p", "/"],
    [`${publicOrigin}//evil.example/p`, "/"],
    [`${publicOrigin}/p/1?x=1#h`, "/p/1?x=1#h"],
  ])("reduces callbackURL %s to same-origin path %s", async (input, path) => {
    const state = await authorizationState(input);
    const response = await callback(state, { error: "access_denied" });
    const back = new URL(response.headers.get("Location")!, publicOrigin);
    expect(back.origin).toBe(publicOrigin);
    expect(`${back.pathname}${back.search}${back.hash}`).toBe(
      path === "/"
        ? "/?bing_link_error=bing&error=access_denied"
        : "/p/1?x=1&bing_link_error=bing&error=access_denied#h",
    );
  });

  it("exchanges the code and persists one grant per user", async () => {
    mocks.fetch.mockResolvedValue(
      tokenResponse({
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_in: 3600,
        token_type: "bearer",
      }),
    );

    const response = await callback(await authorizationState(), {
      code: "code-1",
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "/p/project/settings?tab=integrations",
    );
    const body = mocks.fetch.mock.calls[0][1]?.body;
    if (!(body instanceof URLSearchParams)) throw new Error("form body");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("redirect_uri")).toBe(redirectUri);
    expect(await grants()).toEqual([
      {
        user_id: "user-1",
        provider_id: "bing-webmaster",
        account_id: "oauth",
        access_token: "access-token",
        refresh_token: "refresh-token",
      },
    ]);
  });

  it("replaces the grant on reconnect and keeps the refresh token when Bing omits it", async () => {
    mocks.fetch.mockResolvedValue(
      tokenResponse({
        access_token: "first",
        refresh_token: "refresh-1",
      }),
    );
    await callback(await authorizationState(), { code: "code-1" });

    // Bing omits the refresh token on some exchanges.
    mocks.fetch.mockResolvedValue(tokenResponse({ access_token: "second" }));
    await callback(await authorizationState(), { code: "code-2" });

    expect(await grants()).toEqual([
      {
        user_id: "user-1",
        provider_id: "bing-webmaster",
        account_id: "oauth",
        access_token: "second",
        refresh_token: "refresh-1",
      },
    ]);
  });

  it.each(["network failure", "invalid token response"])(
    "returns %s to the connect page without storing a grant",
    async (failure) => {
      const state = await authorizationState();
      if (failure === "network failure") {
        mocks.fetch.mockRejectedValue(new Error("Network unavailable"));
      } else {
        mocks.fetch.mockResolvedValue(
          new Response("not-json", { status: 200 }),
        );
      }

      const response = await callback(state, { code: "code-1" });

      expect(response.headers.get("Location")).toBe(
        "/p/project/settings?tab=integrations&bing_link_error=bing&error=oauth_code_verification_failed",
      );
      expect(await grants()).toEqual([]);
    },
  );

  it("returns a grant save failure to the connect page", async () => {
    const state = await authorizationState();
    mocks.fetch.mockResolvedValue(
      tokenResponse({ access_token: "access-token" }),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await client.execute(
        "CREATE TRIGGER fail_insert BEFORE INSERT ON account BEGIN SELECT RAISE(ABORT, 'database unavailable'); END",
      );
      const response = await callback(state, { code: "code-1" });

      expect(response.headers.get("Location")).toBe(
        "/p/project/settings?tab=integrations&bing_link_error=bing&error=connection_save_failed",
      );
      expect(log).toHaveBeenCalledWith(
        "bing.oauth.grant_save_failed",
        expect.anything(),
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
      let state = await authorizationState();
      if (kind === "unknown") state = `${state.slice(0, -1)}x`;
      if (kind === "expired")
        vi.setSystemTime(new Date("2026-08-07T12:11:00Z"));
      if (kind === "already used") {
        await callback(state, { error: "access_denied" });
      }

      const response = await callback(
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
    await authorizationState();
    vi.setSystemTime(new Date("2026-08-07T12:11:00Z"));
    await authorizationState();

    const rows = await client.execute(
      "SELECT identifier LIKE 'bing-link:%' AS is_bing FROM verification",
    );
    expect(rows.rows.map((row) => row.is_bing)).toEqual([1]);
  });

  it("throws AUTH_CONFIG_MISSING without a client", async () => {
    mocks.getBingOAuthClientConfig.mockResolvedValue(null);
    mocks.hasBingOAuthConfig.mockResolvedValue(false);

    await expect(
      oauth.createBingAuthorizationUrl({
        userId,
        callbackURL,
        publicOrigin,
      }),
    ).rejects.toMatchObject({ code: "AUTH_CONFIG_MISSING" });
  });

  describe("getBingAccessToken", () => {
    const insertGrant = (values: {
      accessToken: string | null;
      refreshToken: string | null;
      expiresAtMs: number | null;
    }) =>
      client.execute({
        sql: "INSERT INTO account (id, account_id, provider_id, user_id, access_token, refresh_token, access_token_expires_at, created_at, updated_at) VALUES ('grant-1', 'oauth', 'bing-webmaster', 'user-1', ?, ?, ?, 0, 0)",
        args: [values.accessToken, values.refreshToken, values.expiresAtMs],
      });

    const readGrant = async () => {
      const result = await client.execute(
        "SELECT access_token, refresh_token FROM account WHERE id = 'grant-1'",
      );
      return result.rows.map((row) => ({ ...row }));
    };

    it("returns a fresh token without calling Bing", async () => {
      await insertGrant({
        accessToken: "live-token",
        refreshToken: "refresh-1",
        expiresAtMs: Date.now() + 3_600_000,
      });

      const token = await oauth.getBingAccessToken({ userId });

      expect(token).toBe("live-token");
      expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it("refreshes an expired token and persists the rotation", async () => {
      await insertGrant({
        accessToken: "stale-token",
        refreshToken: "refresh-1",
        expiresAtMs: Date.now() - 1_000,
      });
      mocks.fetch.mockResolvedValue(
        tokenResponse({
          access_token: "fresh-token",
          refresh_token: "refresh-2",
        }),
      );

      const token = await oauth.getBingAccessToken({ userId });

      expect(token).toBe("fresh-token");
      const body = mocks.fetch.mock.calls[0][1]?.body;
      if (!(body instanceof URLSearchParams)) throw new Error("form body");
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("refresh-1");
      expect(await readGrant()).toEqual([
        { access_token: "fresh-token", refresh_token: "refresh-2" },
      ]);
    });

    it("throws when no grant exists", async () => {
      await expect(oauth.getBingAccessToken({ userId })).rejects.toThrow(
        "No bing-webmaster grant for this user.",
      );
    });

    it("throws when Bing refuses the refresh", async () => {
      await insertGrant({
        accessToken: "stale-token",
        refreshToken: "refresh-1",
        expiresAtMs: Date.now() - 1_000,
      });
      mocks.fetch.mockResolvedValue(new Response("no", { status: 400 }));

      await expect(oauth.getBingAccessToken({ userId })).rejects.toThrow(
        "Bing refused to refresh the bing-webmaster grant.",
      );
    });

    it("throws when an expired grant has no refresh token", async () => {
      await insertGrant({
        accessToken: "stale-token",
        refreshToken: null,
        expiresAtMs: Date.now() - 1_000,
      });

      await expect(oauth.getBingAccessToken({ userId })).rejects.toThrow(
        "cannot be refreshed",
      );
      expect(mocks.fetch).not.toHaveBeenCalled();
    });
  });
});
