import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireDgtlSeoAccess } from "./dgtl-access";

const mocks = vi.hoisted(() => ({
  env: {} as Record<string, string>,
  accounts: vi.fn(),
  token: vi.fn(),
}));
vi.mock("cloudflare:workers", () => ({ env: mocks.env }));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({ api: { getAccessToken: mocks.token } }),
}));
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: { getDgtlAccount: mocks.accounts },
}));

describe("central SEO authorization", () => {
  beforeEach(() => {
    for (const key of Object.keys(mocks.env)) delete mocks.env[key];
    Object.assign(mocks.env, {
      AUTH_MODE: "hosted",
      DGTL_SSO_ENABLED: "true",
      DGTL_SSO_REQUIRED: "true",
      DGTL_SSO_DISCOVERY_URL:
        "https://example.supabase.co/auth/v1/.well-known/openid-configuration",
      DGTL_SSO_CLIENT_ID: "seo",
      DGTL_SSO_CLIENT_SECRET: "secret",
      DGTL_SSO_ACCESS_CHECK_URL: "https://api.example.com/v1/me",
    });
    mocks.accounts.mockResolvedValue([{ accountId: "central-user" }]);
    mocks.token.mockResolvedValue({ accessToken: "current-token" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          id: "central-user",
          status: "active",
          services: [{ key: "seo" }],
        }),
      ),
    );
  });

  it("checks the bound central identity using a server-side token", async () => {
    await expect(requireDgtlSeoAccess("local-user")).resolves.toBeUndefined();
    expect(mocks.token).toHaveBeenCalledWith({
      body: {
        providerId: "dgtl-sso",
        userId: "local-user",
        accountId: "central-user",
      },
    });
  });
  it("requires linking in strict mode", async () => {
    mocks.accounts.mockResolvedValue([]);
    await expect(requireDgtlSeoAccess("local-user")).rejects.toThrow(
      "DGTL_LINK_REQUIRED",
    );
  });
  it("allows only unlinked legacy accounts during the migration window", async () => {
    mocks.env.DGTL_SSO_REQUIRED = "false";
    mocks.accounts.mockResolvedValue([]);
    await expect(requireDgtlSeoAccess("local-user")).resolves.toBeUndefined();
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it("denies multiple linked central identities", async () => {
    mocks.accounts.mockResolvedValue([{ accountId: "a" }, { accountId: "b" }]);
    await expect(requireDgtlSeoAccess("local-user")).rejects.toThrow(
      "FORBIDDEN",
    );
  });
  it("fails closed if token refresh fails", async () => {
    mocks.token.mockRejectedValueOnce(new Error("expired refresh token"));
    await expect(requireDgtlSeoAccess("local-user")).rejects.toThrow(
      "DGTL_REAUTH_REQUIRED",
    );
  });
  it("fails closed when central access is removed or unavailable", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(requireDgtlSeoAccess("local-user")).rejects.toThrow(
      "FORBIDDEN",
    );
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    await expect(requireDgtlSeoAccess("local-user")).rejects.toThrow(
      "UPSTREAM_UNAVAILABLE",
    );
  });
  it("requests reauthentication when the central API rejects a token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(requireDgtlSeoAccess("local-user")).rejects.toThrow(
      "DGTL_REAUTH_REQUIRED",
    );
  });
  it("distinguishes malformed and unavailable profiles from permission denial", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ error: "unexpected" }),
    );
    await expect(requireDgtlSeoAccess("local-user")).rejects.toThrow(
      "UPSTREAM_UNAVAILABLE",
    );
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(requireDgtlSeoAccess("local-user")).rejects.toThrow(
      "UPSTREAM_UNAVAILABLE",
    );
  });
  it("does not affect self-hosted mode", async () => {
    mocks.env.AUTH_MODE = "local_noauth";
    await expect(requireDgtlSeoAccess("local-user")).resolves.toBeUndefined();
    expect(mocks.accounts).not.toHaveBeenCalled();
  });
});
