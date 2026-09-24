import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { googleAuthErrorCopy } from "./googleAuthErrorCopy";
import { brand } from "@/shared/brand";

const captureClientEvent = vi.hoisted(() => vi.fn());
vi.mock("@/client/lib/posthog", () => ({ captureClientEvent }));

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
  it("recovers an account conflict appended after the dashboard anchor", async () => {
    const { errors, location, state, replaceState } = await openCallback(
      "/p/project-a?google_link_error=gsc#connect-gsc&error=account_already_linked_to_different_user&error_description=Already%20linked",
    );

    const error = errors.getGoogleLinkError("gsc");
    expect(error).toEqual({ code: "account_already_linked_to_different_user" });
    const copy = googleAuthErrorCopy(error!.code, "Search Console");
    expect(copy.title).toBe("Google account already connected");
    expect(copy.description).toContain(
      `Sign in to the ${brand.name} user that linked it`,
    );
    expect(location.href).toBe(
      "https://app.example.com/p/project-a#connect-gsc",
    );
    expect(replaceState).toHaveBeenCalledWith(state, "", expect.any(URL));

    errors.reportGoogleLinkErrorOnce();
    errors.reportGoogleLinkErrorOnce();
    expect(captureClientEvent).toHaveBeenCalledExactlyOnceWith(
      "gsc:connect_error",
      { error_code: "account_already_linked_to_different_user" },
    );
    expect(errors.getGoogleLinkError("ga4")).toBeNull();
    errors.clearGoogleLinkError();
    expect(errors.getGoogleLinkError("gsc")).toBeNull();
  });

  it("keeps ordinary query errors and onboarding step parameters", async () => {
    const { errors, location } = await openCallback(
      "/onboarding?step=3&google_link_error=gsc&error=access_denied&error_description=Denied",
    );
    expect(errors.getGoogleLinkError("gsc")).toEqual({ code: "access_denied" });
    expect(location.href).toBe("https://app.example.com/onboarding?step=3");
  });

  it("preserves unrelated query and fragment parameters and supports GA4", async () => {
    const { errors, location } = await openCallback(
      "/p/project-a?range=28d&google_link_error=ga4#connect-ga4&tab=overview&error=state_mismatch",
    );
    expect(errors.getGoogleLinkError("ga4")).toEqual({
      code: "state_mismatch",
    });
    expect(location.href).toBe(
      "https://app.example.com/p/project-a?range=28d#connect-ga4&tab=overview",
    );
    errors.reportGoogleLinkErrorOnce();
    expect(captureClientEvent).toHaveBeenCalledWith("ga4:connect_error", {
      error_code: "state_mismatch",
    });
  });

  it("prefers a query error when both locations contain one", async () => {
    const { errors, location } = await openCallback(
      "/p/project-a?google_link_error=gsc&error=access_denied#connect-gsc&error=state_mismatch",
    );
    expect(errors.getGoogleLinkError("gsc")).toEqual({ code: "access_denied" });
    expect(location.hash).toBe("#connect-gsc");
  });

  it("does not consume errors from unrelated redirects", async () => {
    const path =
      "/p/project-a?error=access_denied#connect-gsc&error=state_mismatch";
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
