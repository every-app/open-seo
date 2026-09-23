import { afterEach, describe, expect, it, vi } from "vitest";
import { getDgtlSsoProviderConfig, hasDgtlSeoAccess } from "./dgtl-sso";

const configured = {
  AUTH_MODE: "hosted",
  DGTL_SSO_ENABLED: "true",
  DGTL_SSO_DISCOVERY_URL:
    "https://example.supabase.co/auth/v1/.well-known/openid-configuration",
  DGTL_SSO_CLIENT_ID: "seo-client",
  DGTL_SSO_CLIENT_SECRET: "secret",
  DGTL_SSO_ACCESS_CHECK_URL: "https://api.example.com/v1/me",
};

describe("DGTL SSO provider configuration", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is disabled outside hosted mode or before rollout", () => {
    expect(
      getDgtlSsoProviderConfig({ ...configured, AUTH_MODE: "local_noauth" }),
    ).toBeNull();
    expect(
      getDgtlSsoProviderConfig({ ...configured, DGTL_SSO_ENABLED: "false" }),
    ).toBeNull();
  });

  it("uses OIDC and PKCE, allowing centrally approved provisioning", () => {
    expect(getDgtlSsoProviderConfig(configured)).toMatchObject({
      providerId: "dgtl-sso",
      scopes: ["openid", "email", "profile"],
      pkce: true,
      authentication: "basic",
      disableSignUp: false,
    });
  });

  it("fails closed when enabled without complete credentials", () => {
    expect(() =>
      getDgtlSsoProviderConfig({ ...configured, DGTL_SSO_CLIENT_SECRET: "" }),
    ).toThrow("DGTL SSO requires");
  });

  it("rejects an insecure or non-OIDC discovery URL", () => {
    expect(() =>
      getDgtlSsoProviderConfig({
        ...configured,
        DGTL_SSO_DISCOVERY_URL:
          "http://example.com/auth/v1/.well-known/openid-configuration",
      }),
    ).toThrow("DGTL_SSO_DISCOVERY_URL");
    expect(() =>
      getDgtlSsoProviderConfig({
        ...configured,
        DGTL_SSO_DISCOVERY_URL: "https://example.com/login",
      }),
    ).toThrow("DGTL_SSO_DISCOVERY_URL");
  });

  it("uses verified Supabase UserInfo rather than ID-token claims", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sub: "central-user-id",
            email: "client@example.com",
            email_verified: true,
            name: "Client",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "central-user-id",
            status: "active",
            services: [{ key: "seo" }],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const provider = getDgtlSsoProviderConfig(configured);
    expect(
      await provider?.getUserInfo({ accessToken: "access-token" }),
    ).toMatchObject({
      id: "central-user-id",
      email: "client@example.com",
      emailVerified: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.supabase.co/auth/v1/oauth/userinfo",
      {
        headers: { Authorization: "Bearer access-token" },
        cache: "no-store",
        signal: expect.any(AbortSignal) as unknown,
      },
    );
    expect(fetchMock).toHaveBeenCalledWith("https://api.example.com/v1/me", {
      headers: { Authorization: "Bearer access-token" },
      cache: "no-store",
      signal: expect.any(AbortSignal) as unknown,
    });
  });

  it("rejects required SSO when the provider is disabled", () => {
    expect(() =>
      getDgtlSsoProviderConfig({
        ...configured,
        DGTL_SSO_REQUIRED: "true",
        DGTL_SSO_ENABLED: "false",
      }),
    ).toThrow();
  });

  it.each([
    { id: "wrong-user", status: "active", services: [{ key: "seo" }] },
    { id: "user", status: "suspended", services: [{ key: "seo" }] },
    { id: "user", status: "invited", services: [{ key: "seo" }] },
    { id: "user", status: "active", services: [] },
    { error: "invalid profile" },
  ])("rejects invalid or revoked central access: %j", async (profile) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(profile)));
    expect(
      await hasDgtlSeoAccess(
        configured.DGTL_SSO_ACCESS_CHECK_URL,
        "token",
        "user",
      ),
    ).toBe(false);
  });

  it("rejects an unverified UserInfo email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            sub: "central-user-id",
            email: "client@example.com",
            email_verified: false,
          }),
          { status: 200 },
        ),
      ),
    );
    const provider = getDgtlSsoProviderConfig(configured);
    expect(
      await provider?.getUserInfo({ accessToken: "access-token" }),
    ).toBeNull();
  });

  it("rejects users who lack active SEO service access", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              sub: "central-user-id",
              email: "client@example.com",
              email_verified: true,
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              id: "central-user-id",
              status: "active",
              services: [{ key: "cms" }],
            }),
            { status: 200 },
          ),
        ),
    );
    const provider = getDgtlSsoProviderConfig(configured);
    expect(
      await provider?.getUserInfo({ accessToken: "access-token" }),
    ).toBeNull();
  });
});
