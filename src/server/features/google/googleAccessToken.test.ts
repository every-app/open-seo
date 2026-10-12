import { beforeEach, describe, expect, it, vi } from "vitest";
import { getGoogleAccessToken } from "./googleOAuth";

const mocks = vi.hoisted(() => ({
  getGoogleOAuthClientConfig: vi.fn(),
  fetch: vi.fn<typeof fetch>(),
  selectLimit: vi.fn(),
  updateSet: vi.fn(),
  getAuth: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
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
    update: () => ({
      set: mocks.updateSet.mockReturnValue({ where: vi.fn() }),
    }),
  },
}));
vi.mock("@/lib/auth", () => ({ getAuth: mocks.getAuth }));
vi.mock("./oauth-config", () => ({
  getGoogleOAuthClientConfig: mocks.getGoogleOAuthClientConfig,
}));

describe("getGoogleAccessToken", () => {
  const userId = "user-1";
  const grant = {
    id: "account-row",
    accessToken: "stored-access",
    refreshToken: "stored-refresh",
    accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1_000),
  };

  beforeEach(() => {
    mocks.getGoogleOAuthClientConfig.mockResolvedValue({
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
    });
    mocks.getAuth.mockReturnValue({
      $context: Promise.resolve({
        options: { account: { encryptOAuthTokens: false } },
        secretConfig: "secret",
      }),
    });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("returns the stored token while it is fresh", async () => {
    mocks.selectLimit.mockResolvedValue([grant]);

    await expect(
      getGoogleAccessToken({
        userId,
        providerId: "google-search-console",
        accountId: "google-account-1",
      }),
    ).resolves.toBe("stored-access");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("refreshes an expiring token against Google and persists it", async () => {
    mocks.selectLimit.mockResolvedValue([
      { ...grant, accessTokenExpiresAt: new Date(Date.now() + 1_000) },
    ]);
    mocks.fetch.mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "new-access", expires_in: 3600 }),
        { status: 200 },
      ),
    );

    await expect(
      getGoogleAccessToken({ userId, providerId: "google-analytics" }),
    ).resolves.toBe("new-access");
    const body = mocks.fetch.mock.calls[0][1]?.body;
    if (!(body instanceof URLSearchParams)) throw new Error("form body");
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("stored-refresh");
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "new-access" }),
    );
  });

  it("rejects an expired grant that has no refresh token", async () => {
    mocks.selectLimit.mockResolvedValue([
      {
        ...grant,
        refreshToken: null,
        accessTokenExpiresAt: new Date(Date.now() - 1_000),
      },
    ]);

    await expect(
      getGoogleAccessToken({ userId, providerId: "google-search-console" }),
    ).rejects.toThrow(/cannot be refreshed/);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("rejects when Google refuses the refresh", async () => {
    mocks.selectLimit.mockResolvedValue([
      { ...grant, accessTokenExpiresAt: null },
    ]);
    mocks.fetch.mockResolvedValue(new Response("", { status: 400 }));

    await expect(
      getGoogleAccessToken({ userId, providerId: "google-analytics" }),
    ).rejects.toThrow(/refused to refresh/);
    expect(mocks.updateSet).not.toHaveBeenCalled();
  });
});
