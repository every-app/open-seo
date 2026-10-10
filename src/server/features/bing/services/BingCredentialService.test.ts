import { beforeEach, describe, expect, it, vi } from "vitest";
import { BingCredentialService } from "./BingCredentialService";

const mocks = vi.hoisted(() => ({
  getBingAccessToken: vi.fn(),
  hasBingGrant: vi.fn(),
  removeBingGrant: vi.fn(),
  listSites: vi.fn(),
  listForUser: vi.fn(),
  deleteOAuthMappingsForUser: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/bing/bingOAuth", () => ({
  getBingAccessToken: mocks.getBingAccessToken,
  hasBingGrant: mocks.hasBingGrant,
  removeBingGrant: mocks.removeBingGrant,
}));
vi.mock("@/server/lib/bingClient", () => ({
  createBingClient: vi.fn(() => ({
    listSites: mocks.listSites,
  })),
}));
vi.mock("@/server/features/bing/repositories/BingConnectionRepository", () => ({
  BingConnectionRepository: {
    deleteOAuthMappingsForUser: mocks.deleteOAuthMappingsForUser,
  },
}));
vi.mock("@/server/features/bing/repositories/BingCredentialRepository", () => ({
  BingCredentialRepository: {
    listForUser: mocks.listForUser,
  },
}));

describe("BingCredentialService OAuth branches", () => {
  beforeEach(() => {
    mocks.hasBingGrant.mockResolvedValue(false);
    mocks.getBingAccessToken.mockResolvedValue("oauth-token");
    mocks.listForUser.mockResolvedValue([]);
    mocks.listSites.mockResolvedValue([
      { url: "https://example.com/", isVerified: true },
    ]);
  });

  it("lists the OAuth account first, ahead of stored keys", async () => {
    mocks.hasBingGrant.mockResolvedValue(true);
    const result = await BingCredentialService.listSitesForUser("user_1");

    expect(mocks.getBingAccessToken).toHaveBeenCalledWith({
      userId: "user_1",
    });
    expect(result.accounts[0]).toMatchObject({
      credentialId: null,
      keyLast4: null,
      requiresReconnect: false,
    });
  });

  it("marks the OAuth account for reconnect when its token is dead", async () => {
    mocks.hasBingGrant.mockResolvedValue(true);
    mocks.getBingAccessToken.mockRejectedValue(new Error("revoked"));

    const result = await BingCredentialService.listSitesForUser("user_1");

    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]).toMatchObject({
      credentialId: null,
      requiresReconnect: true,
      sites: [],
    });
  });

  it("reports having a credential from the grant alone", async () => {
    mocks.hasBingGrant.mockResolvedValue(true);

    await expect(
      BingCredentialService.hasAnyCredential("user_1"),
    ).resolves.toBe(true);
  });

  it("removeOAuthCredential deletes OAuth mappings then the grant", async () => {
    await BingCredentialService.removeOAuthCredential("user_1");

    expect(mocks.deleteOAuthMappingsForUser).toHaveBeenCalledWith("user_1");
    expect(mocks.removeBingGrant).toHaveBeenCalledWith("user_1");
  });
});
