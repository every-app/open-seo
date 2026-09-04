import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BING_AUTHORIZE_URL,
  BING_OAUTH_PROVIDER_ID,
  BING_TOKEN_URL,
} from "@/shared/bing";
import {
  bingProviderConfig,
  getBingOAuthClientConfig,
  hasBingOAuthConfig,
} from "@/server/features/bing/oauth-config";

// oauth-config.ts imports the Workers env binding at module scope (like
// src/lib/auth-config.ts does); stub it so the module loads under node.
vi.mock("cloudflare:workers", () => ({ env: {} }));

const VALID_SECRET = "s".repeat(32);

function bingAccessToken(claims: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(claims)).toString("base64url");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getBingOAuthClientConfig", () => {
  it("returns null when BING_CLIENT_ID is missing", async () => {
    vi.stubEnv("BING_CLIENT_ID", "");
    vi.stubEnv("BING_CLIENT_SECRET", "secret");

    await expect(getBingOAuthClientConfig()).resolves.toBeNull();
  });

  it("returns null when BING_CLIENT_SECRET is missing", async () => {
    vi.stubEnv("BING_CLIENT_ID", "client-id");
    vi.stubEnv("BING_CLIENT_SECRET", "");

    await expect(getBingOAuthClientConfig()).resolves.toBeNull();
  });

  it("trims whitespace when both env vars are present", async () => {
    vi.stubEnv("BING_CLIENT_ID", "  client-id  ");
    vi.stubEnv("BING_CLIENT_SECRET", "  client-secret  ");

    await expect(getBingOAuthClientConfig()).resolves.toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
    });
  });
});

describe("hasBingOAuthConfig", () => {
  it("rejects a BETTER_AUTH_SECRET shorter than 32 chars", async () => {
    vi.stubEnv("BING_CLIENT_ID", "client-id");
    vi.stubEnv("BING_CLIENT_SECRET", "client-secret");
    vi.stubEnv("BETTER_AUTH_SECRET", "s".repeat(31));

    await expect(hasBingOAuthConfig()).resolves.toBe(false);
  });

  it("rejects when the OAuth client is not configured", async () => {
    vi.stubEnv("BING_CLIENT_ID", "");
    vi.stubEnv("BING_CLIENT_SECRET", "");
    vi.stubEnv("BETTER_AUTH_SECRET", VALID_SECRET);

    await expect(hasBingOAuthConfig()).resolves.toBe(false);
  });

  it("accepts client credentials plus a >=32 char secret", async () => {
    vi.stubEnv("BING_CLIENT_ID", "client-id");
    vi.stubEnv("BING_CLIENT_SECRET", "client-secret");
    vi.stubEnv("BETTER_AUTH_SECRET", VALID_SECRET);

    await expect(hasBingOAuthConfig()).resolves.toBe(true);
  });
});

describe("bingProviderConfig", () => {
  it("uses the explicit Bing endpoints (no OIDC discovery) with PKCE", () => {
    expect(bingProviderConfig.providerId).toBe(BING_OAUTH_PROVIDER_ID);
    expect(bingProviderConfig.authorizationUrl).toBe(BING_AUTHORIZE_URL);
    expect(bingProviderConfig.tokenUrl).toBe(BING_TOKEN_URL);
    expect(bingProviderConfig.discoveryUrl).toBeUndefined();
    expect(bingProviderConfig.scopes).toEqual(["Webmaster.read"]);
    expect(bingProviderConfig.pkce).toBe(true);
  });

  it("getUserInfo maps a decodable access token to { id, email }", async () => {
    const token = bingAccessToken({
      webmasteruid: "uid-123",
      webmasteremail: "owner@example.com",
    });

    await expect(
      bingProviderConfig.getUserInfo?.({ accessToken: token }),
    ).resolves.toEqual({
      id: "uid-123",
      email: "owner@example.com",
      emailVerified: false,
      name: "owner@example.com",
    });
  });

  it("getUserInfo returns null email/name when Bing omits the email claim", async () => {
    const token = bingAccessToken({ webmasteruid: "uid-456" });

    await expect(
      bingProviderConfig.getUserInfo?.({ accessToken: token }),
    ).resolves.toEqual({
      id: "uid-456",
      email: null,
      emailVerified: false,
      // Bing has no display name; absent rather than null, so better-auth's
      // `name?: string` is satisfied without a cast.
      name: undefined,
    });
  });

  it("getUserInfo returns null for an undecodable access token", async () => {
    await expect(
      bingProviderConfig.getUserInfo?.({ accessToken: "not-a-bing-token" }),
    ).resolves.toBeNull();
  });

  it("getUserInfo returns null when the access token is absent", async () => {
    await expect(bingProviderConfig.getUserInfo?.({})).resolves.toBeNull();
  });
});
