import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { googleAuthErrorCopy } from "./googleAuthErrorCopy";

const captureClientEvent = vi.hoisted(() => vi.fn());
vi.mock("@/client/lib/posthog", () => ({ captureClientEvent }));

// Capture runs once per module instance, so each test needs a fresh module.
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

async function openCallback(path: string) {
  const location = new URL(path, "https://app.example.com");
  const state = { key: "preserved-router-state" };
  const replaceState = vi.fn((_state, _title, url: URL) => {
    location.href = url.href;
  });
  vi.stubGlobal("window", {
    location,
    history: { state, replaceState },
  });
  const errors = await import("./googleLinkError");
  errors.captureGoogleLinkError();
  return { errors, location, state, replaceState };
}

describe("Google link callback errors", () => {
  it("recovers the error and keeps the dashboard anchor", async () => {
    const { errors, location, state, replaceState } = await openCallback(
      "/p/project-a?google_link_error=gsc&error=access_denied#connect-gsc",
    );

    const error = errors.getGoogleLinkError("gsc");
    expect(error).toEqual({ code: "access_denied" });
    const copy = googleAuthErrorCopy(error!.code, "Search Console");
    expect(copy.title).toBe("Search Console connection was canceled");
    expect(location.href).toBe(
      "https://app.example.com/p/project-a#connect-gsc",
    );
    expect(replaceState).toHaveBeenCalledWith(state, "", expect.any(URL));

    errors.reportGoogleLinkErrorOnce();
    errors.reportGoogleLinkErrorOnce();
    expect(captureClientEvent).toHaveBeenCalledExactlyOnceWith(
      "gsc:connect_error",
      { error_code: "access_denied" },
    );
    expect(errors.getGoogleLinkError("ga4")).toBeNull();
    errors.clearGoogleLinkError();
    expect(errors.getGoogleLinkError("gsc")).toBeNull();
  });

  it("keeps ordinary query errors and onboarding step parameters", async () => {
    const { errors, location } = await openCallback(
      "/onboarding?step=3&google_link_error=gsc&error=access_denied",
    );
    expect(errors.getGoogleLinkError("gsc")).toEqual({ code: "access_denied" });
    expect(location.href).toBe("https://app.example.com/onboarding?step=3");
  });

  it("does not consume errors from unrelated redirects", async () => {
    const path = "/p/project-a?error=access_denied#connect-gsc";
    const { errors, location, replaceState } = await openCallback(path);
    expect(errors.getGoogleLinkError("gsc")).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
    expect(location.href).toBe("https://app.example.com" + path);
    errors.reportGoogleLinkErrorOnce();
    expect(captureClientEvent).not.toHaveBeenCalled();
  });

  it("reports unknown when a marked callback has no error code", async () => {
    const { errors } = await openCallback("/p/project-a?google_link_error=gsc");
    expect(errors.getGoogleLinkError("gsc")).toEqual({ code: "unknown" });
  });
});
