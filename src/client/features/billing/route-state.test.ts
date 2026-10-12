import { describe, expect, it } from "vitest";
import { getSubscribeRouteState } from "./route-state";

describe("getSubscribeRouteState", () => {
  // hasManagedAccess is true for essentially every hosted customer: the free
  // plan is the Autumn default and grants managed_service_access too.
  const base = {
    isCustomerLoading: false,
    isCustomerError: false,
    hasCustomerData: true,
    hasManagedAccess: true,
    planStatus: "free" as const,
    isUpgradeFlow: false,
    checkoutCompleted: false,
    finalizingTimedOut: false,
  };

  it("redirects paying customers into the app", () => {
    expect(getSubscribeRouteState({ ...base, planStatus: "paid" })).toBe(
      "redirectToApp",
    );
  });

  it("redirects free-plan users with managed access into the app unless they asked to upgrade", () => {
    expect(getSubscribeRouteState(base)).toBe("redirectToApp");
    expect(getSubscribeRouteState({ ...base, isUpgradeFlow: true })).toBe(
      "showPaywall",
    );
    expect(getSubscribeRouteState({ ...base, hasManagedAccess: false })).toBe(
      "showPaywall",
    );
  });

  it("finalizes after checkout even though managed access would redirect", () => {
    // Regression: managed access is granted by the free plan, so checking it
    // before checkoutCompleted sent just-paid users into the app as "free".
    expect(getSubscribeRouteState({ ...base, checkoutCompleted: true })).toBe(
      "finalizing",
    );
  });

  it("keeps finalizing after a failed poll", () => {
    expect(
      getSubscribeRouteState({
        ...base,
        checkoutCompleted: true,
        isCustomerError: true,
      }),
    ).toBe("finalizing");
  });

  it("keeps the paywall when a customer refetch fails, but not a first load", () => {
    const failed = { ...base, isUpgradeFlow: true, isCustomerError: true };

    expect(getSubscribeRouteState(failed)).toBe("showPaywall");
    expect(getSubscribeRouteState({ ...failed, hasCustomerData: false })).toBe(
      "error",
    );
  });

  it("lets the user through once the finalizing window runs out", () => {
    expect(
      getSubscribeRouteState({
        ...base,
        checkoutCompleted: true,
        finalizingTimedOut: true,
      }),
    ).toBe("redirectToApp");

    // Even a poll error must not extend the wait past the deadline.
    expect(
      getSubscribeRouteState({
        ...base,
        checkoutCompleted: true,
        finalizingTimedOut: true,
        isCustomerError: true,
      }),
    ).toBe("redirectToApp");
  });
});
