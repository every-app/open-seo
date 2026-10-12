import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { startLink } = vi.hoisted(() => ({ startLink: vi.fn() }));
vi.mock("@/serverFunctions/gsc", () => ({ startGscLink: startLink }));
vi.mock("@/serverFunctions/ga4", () => ({ startGa4Link: startLink }));
vi.mock("@/serverFunctions/google-ads", () => ({
  startGoogleAdsLink: startLink,
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
    let finish!: (value: { url: string }) => void;
    startLink.mockImplementationOnce(
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
    expect(startLink).toHaveBeenCalledTimes(1);
    finish({ url: "https://accounts.google.com/authorize" });
    expect(await request).toBe(true);
    expect(window.location.href).toBe("https://accounts.google.com/authorize");
    expect(useGoogleLinkPending()).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(useGoogleLinkPending()).toBe(true);
    // Preserve recovery when the user cancels a browser navigation.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(useGoogleLinkPending()).toBe(false);
  });

  it("clears loading after a failed request and allows retry", async () => {
    startLink.mockRejectedValueOnce(new Error("Network unavailable"));
    expect(await startGoogleLink("gsc", "/p/1")).toBe(false);
    expect(useGoogleLinkPending()).toBe(false);
    startLink.mockResolvedValueOnce({
      url: "https://accounts.google.com/authorize",
    });
    expect(await startGoogleLink("gsc", "/p/1")).toBe(true);
    expect(useGoogleLinkPending()).toBe(true);
  });
});
