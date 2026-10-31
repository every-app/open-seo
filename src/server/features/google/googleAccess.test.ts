import { afterEach, describe, expect, it, vi } from "vitest";

const { workerEnv, resolveUser } = vi.hoisted(() => ({
  workerEnv: {} as Record<string, string>,
  resolveUser: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: workerEnv }));
vi.mock("@/lib/auth", () => ({ getAuth: vi.fn() }));
vi.mock("@/middleware/ensure-user/resolve", () => ({
  resolveUserContextFromHeaders: resolveUser,
}));

import { getGoogleAccessMode } from "./googleAccess";
import {
  GA4_INTEGRATION,
  GSC_INTEGRATION,
  handleGoogleOAuthCallbackRequest,
} from "./googleOAuth";
import {
  getGoogleOAuthClientConfig,
  hasGoogleOAuthConfig,
} from "./oauth-config";

const GOOGLE_CLIENT = {
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  BETTER_AUTH_SECRET: "x".repeat(64),
};

afterEach(() => {
  for (const key of Object.keys(workerEnv)) delete workerEnv[key];
});

describe("Google behind an Every App gateway", () => {
  it("uses no Google client of OpenSEO's own, even when one is set", async () => {
    Object.assign(workerEnv, { AUTH_MODE: "everyapp", ...GOOGLE_CLIENT });

    expect(await getGoogleAccessMode()).toBe("gateway");
    expect(await getGoogleOAuthClientConfig()).toBeNull();
    expect(await hasGoogleOAuthConfig()).toBe(false);
  });

  it("answers OpenSEO's own Search Console and Analytics callbacks with 404", async () => {
    Object.assign(workerEnv, { AUTH_MODE: "everyapp", ...GOOGLE_CLIENT });

    for (const integration of [GSC_INTEGRATION, GA4_INTEGRATION]) {
      const response = await handleGoogleOAuthCallbackRequest(
        new Request(
          `https://openseo.app.everyapp.com/api/${integration.provider}/oauth/callback?code=c&state=s`,
        ),
        integration,
      );
      expect(response.status).toBe(404);
    }
    expect(resolveUser).not.toHaveBeenCalled();
  });

  it("keeps OpenSEO's own client in the other modes", async () => {
    Object.assign(workerEnv, {
      AUTH_MODE: "cloudflare_access",
      ...GOOGLE_CLIENT,
    });

    expect(await getGoogleAccessMode()).toBe("own_client");
    expect(await getGoogleOAuthClientConfig()).toEqual({
      clientId: "client-id",
      clientSecret: "client-secret",
    });
    expect(await hasGoogleOAuthConfig()).toBe(true);
  });
});
