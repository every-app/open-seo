import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { link, hosted, selfHosted } = vi.hoisted(() => ({
  link: vi.fn(),
  hosted: vi.fn(() => true),
  selfHosted: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({ authClient: { oauth2: { link } } }));
vi.mock("@/lib/auth-mode", () => ({ isHostedClientAuthMode: hosted }));
vi.mock("@/serverFunctions/gsc", () => ({
  startSelfHostedGscLink: selfHosted,
}));
vi.mock("@/serverFunctions/ga4", () => ({
  startSelfHostedGa4Link: selfHosted,
}));
vi.mock("@/serverFunctions/google-ads", () => ({
  startSelfHostedGoogleAdsLink: selfHosted,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
// Browser checks exercise React subscriptions; here read the real pending snapshot
// to test network and navigation timing without a DOM.
vi.mock("react", () => ({
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => boolean) =>
    snapshot(),
}));
import { startGoogleLink, useGoogleLinkPending } from "./startGoogleLink";

beforeEach(() => {
  vi.useFakeTimers();
  hosted.mockReturnValue(true);
  vi.stubGlobal("window", {
    location: {
      origin: "https://app.example.com",
      href: "https://app.example.com/p/1",
    },
  });
});
afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Google authorization loading", () => {
  it("stays pending during a slow request and after the redirect URL is assigned", async () => {
    let finish!: (value: { data: { url: string } }) => void;
    link.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const request = startGoogleLink("gsc", "/p/1");
    expect(useGoogleLinkPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(useGoogleLinkPending()).toBe(true);
    expect(await startGoogleLink("ga4", "/p/1")).toBe(false);
    expect(link).toHaveBeenCalledTimes(1);
    finish({ data: { url: "https://accounts.google.com/authorize" } });
    expect(await request).toBe(true);
    expect(window.location.href).toBe("https://accounts.google.com/authorize");
    expect(useGoogleLinkPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(useGoogleLinkPending()).toBe(true);
    // Preserve recovery when the user cancels a browser navigation.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(useGoogleLinkPending()).toBe(false);
  });

  it.each(["rejected", "missing-url", "network-error"])(
    "clears loading after %s and allows retry",
    async (failure) => {
      if (failure === "network-error")
        link.mockRejectedValueOnce(new Error("Network unavailable"));
      else
        link.mockResolvedValueOnce(
          failure === "rejected"
            ? { error: { message: "Request failed" } }
            : { data: {} },
        );
      expect(await startGoogleLink("gsc", "/p/1")).toBe(false);
      expect(useGoogleLinkPending()).toBe(false);
      link.mockResolvedValueOnce({
        data: { url: "https://accounts.google.com/authorize" },
      });
      expect(await startGoogleLink("gsc", "/p/1")).toBe(true);
      expect(useGoogleLinkPending()).toBe(true);
    },
  );

  it("uses the same pending state for self-hosted authorization", async () => {
    hosted.mockReturnValue(false);
    let finish!: (value: { url: string }) => void;
    selfHosted.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const request = startGoogleLink("ga4", "/p/1");
    expect(useGoogleLinkPending()).toBe(true);
    finish({ url: "https://accounts.google.com/authorize" });
    expect(await request).toBe(true);
    expect(useGoogleLinkPending()).toBe(true);
  });
});
