import { afterEach, describe, expect, it, vi } from "vitest";
import { isSigningOut, signOutAndRedirect } from "./auth-client";

const mocks = vi.hoisted(() => ({ signOut: vi.fn(), assign: vi.fn() }));
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({ signOut: mocks.signOut }),
}));
vi.mock("@/client/lib/posthog", () => ({
  captureClientEvent: vi.fn(),
  resetAnalyticsUser: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("SEO-only logout", () => {
  function setup(enabled: boolean, success: boolean) {
    vi.stubEnv("AUTH_MODE", "hosted");
    vi.stubEnv("VITE_DGTL_SSO_ENABLED", String(enabled));
    vi.stubGlobal("window", {
      location: {
        origin: "https://seo.dgtl.lk",
        pathname: "/",
        search: "",
        hash: "",
        assign: mocks.assign,
      },
    });
    mocks.signOut.mockImplementation(
      (options: {
        fetchOptions: { onSuccess: () => void; onError: () => void };
      }) => {
        expect(isSigningOut()).toBe(true);
        if (success) options.fetchOptions.onSuccess();
        else options.fetchOptions.onError();
        return Promise.resolve();
      },
    );
  }
  it("returns to My services after ending only the SEO session", () => {
    setup(true, true);
    signOutAndRedirect();
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.assign).toHaveBeenCalledWith("https://auth.dgtl.lk/user");
  });
  it("does not redirect when local logout fails", () => {
    setup(true, false);
    signOutAndRedirect();
    expect(mocks.assign).not.toHaveBeenCalled();
    expect(isSigningOut()).toBe(false);
  });
  it("preserves the non-DGTL login destination", () => {
    setup(false, true);
    signOutAndRedirect();
    expect(mocks.assign).toHaveBeenCalledWith(
      expect.stringContaining("sso=off"),
    );
  });
});
