import { describe, expect, it } from "vitest";
import { getBillingRouteState, getSubscribeRouteState } from "./route-state";

describe("getBillingRouteState", () => {
  it("shows ready after successful customer lookup", () => {
    expect(
      getBillingRouteState({
        hasSession: true,
        isSessionPending: false,
        isCustomerLoading: false,
        isCustomerError: false,
      }),
    ).toBe("ready");
  });

  it("shows an error state on billing lookup failures", () => {
    expect(
      getBillingRouteState({
        hasSession: true,
        isSessionPending: false,
        isCustomerLoading: false,
        isCustomerError: true,
      }),
    ).toBe("error");
  });

  it("keeps the page blank while auth or billing data is still loading", () => {
    expect(
      getBillingRouteState({
        hasSession: true,
        isSessionPending: true,
        isCustomerLoading: false,
        isCustomerError: false,
      }),
    ).toBe("loading");

    expect(
      getBillingRouteState({
        hasSession: true,
        isSessionPending: false,
        isCustomerLoading: true,
        isCustomerError: false,
      }),
    ).toBe("loading");
  });
});

describe("getSubscribeRouteState", () => {
  // hasManagedAccess is true for essentially every hosted customer: the free
  // plan is the Autumn default and grants managed_service_access too.
  const base = {
    hasSession: true,
    isCustomerLoading: false,
    isCustomerError: false,
    hasManagedAccess: true,
    planStatus: "free" as const,
    isUpgradeFlow: false,
    checkoutCompleted: false,
    finalizingTimedOut: false,
  };

  it("shows an error state on billing lookup failures", () => {
    expect(getSubscribeRouteState({ ...base, isCustomerError: true })).toBe(
      "error",
    );
  });

  it("keeps the page blank while billing data is still loading", () => {
    expect(getSubscribeRouteState({ ...base, isCustomerLoading: true })).toBe(
      "loading",
    );
  });

  it("redirects paying customers into the app", () => {
    expect(getSubscribeRouteState({ ...base, planStatus: "paid" })).toBe(
      "redirectToApp",
    );
  });

  it("redirects free-plan users into the app outside the upgrade flow", () => {
    expect(getSubscribeRouteState(base)).toBe("redirectToApp");
  });

  it("shows the paywall to free-plan users in the upgrade flow", () => {
    expect(getSubscribeRouteState({ ...base, isUpgradeFlow: true })).toBe(
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

  it("shows the paywall to users without managed access", () => {
    expect(getSubscribeRouteState({ ...base, hasManagedAccess: false })).toBe(
      "showPaywall",
    );
  });
});
