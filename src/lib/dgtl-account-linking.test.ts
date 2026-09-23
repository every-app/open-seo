import { describe, expect, it, vi } from "vitest";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { createBaseAuthConfig } from "./auth-config";

vi.mock("cloudflare:workers", () => ({
  env: {
    AUTH_MODE: "hosted",
    DGTL_SSO_ENABLED: "true",
    DGTL_SSO_REQUIRED: "true",
    DGTL_SSO_DISCOVERY_URL:
      "https://example.com/.well-known/openid-configuration",
    DGTL_SSO_CLIENT_ID: "seo",
    DGTL_SSO_CLIENT_SECRET: "test-only",
    DGTL_SSO_ACCESS_CHECK_URL: "https://example.com/v1/me",
  },
}));

describe("verified DGTL account matching", () => {
  it("disables password authentication in mandatory central-login mode", () => {
    expect(createBaseAuthConfig().emailAndPassword.enabled).toBe(false);
  });
  async function attempt(localVerified: boolean, incomingVerified: boolean) {
    const user = {
      id: "original-user",
      email: "client@example.com",
      emailVerified: localVerified,
    };
    const linkAccount = vi.fn().mockResolvedValue({ id: "linked" });
    const createSession = vi.fn().mockResolvedValue({ id: "session" });
    // Minimal library fixture: only the adapter methods exercised here exist.
    // oxlint-disable-next-line typescript-eslint(no-unsafe-type-assertion)
    const ctx = {
      context: {
        options: createBaseAuthConfig(),
        trustedProviders: [],
        logger: { warn: vi.fn(), error: vi.fn() },
        internalAdapter: {
          findOAuthUser: vi.fn().mockResolvedValue({ user, accounts: [] }),
          linkAccount,
          createSession,
        },
      },
    } as unknown as Parameters<typeof handleOAuthUserInfo>[0];
    const result = await handleOAuthUserInfo(ctx, {
      userInfo: {
        id: "central-user",
        email: user.email,
        emailVerified: incomingVerified,
        name: "Client",
      },
      account: { providerId: "dgtl-sso", accountId: "central-user" },
      callbackURL: "/",
      disableSignUp: false,
    });
    return { result, linkAccount, createSession };
  }

  it("keeps the original user when both email identities are verified", async () => {
    const { result, linkAccount, createSession } = await attempt(true, true);
    expect(result.error).toBeNull();
    expect(linkAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "original-user",
        accountId: "central-user",
      }),
    );
    expect(createSession).toHaveBeenCalledWith("original-user");
  });

  it.each([
    [false, true],
    [true, false],
    [false, false],
  ])(
    "rejects unverified matches (local=%s incoming=%s)",
    async (local, incoming) => {
      const { result, linkAccount, createSession } = await attempt(
        local,
        incoming,
      );
      expect(result.error).toBe("account not linked");
      expect(linkAccount).not.toHaveBeenCalled();
      expect(createSession).not.toHaveBeenCalled();
    },
  );
});
