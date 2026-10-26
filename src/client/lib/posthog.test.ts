import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: client }));
vi.mock("@/lib/auth-mode", () => ({ isHostedClientAuthMode: () => true }));

// The module keeps the capture state for the page's lifetime, so each test
// loads a fresh copy.
async function loadPostHog() {
  vi.resetModules();
  return import("./posthog");
}

describe("events reported before the privacy choices are known", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubEnv("POSTHOG_PUBLIC_KEY", "phc_test");
    vi.stubEnv("POSTHOG_HOST", "https://posthog.test");
  });

  it("are sent once analytics starts", async () => {
    const posthog = await loadPostHog();
    posthog.captureClientEvent("onboarding:step_viewed", { step: 0 });
    posthog.startAnalyticsCapture({ replay: false });

    await vi.waitFor(() =>
      expect(client.capture).toHaveBeenCalledWith("onboarding:step_viewed", {
        step: 0,
      }),
    );
  });

  it("are dropped when analytics stays off", async () => {
    const posthog = await loadPostHog();
    posthog.captureClientEvent("onboarding:step_viewed", { step: 0 });
    posthog.stopAnalyticsCapture();
    posthog.startAnalyticsCapture({ replay: false });

    await vi.waitFor(() => expect(client.opt_in_capturing).toHaveBeenCalled());
    expect(client.capture).not.toHaveBeenCalled();
  });
});
