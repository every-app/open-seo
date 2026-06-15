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
  const base = {
    hasSession: true,
    isCustomerLoading: false,
    isCustomerError: false,
    hasManagedAccess: false,
    planStatus: "free" as const,
    isUpgradeFlow: false,
    checkoutCompleted: false,
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

  it("redirects grandfathered free-plan users into the app outside the upgrade flow", () => {
    expect(getSubscribeRouteState({ ...base, hasManagedAccess: true })).toBe(
      "redirectToApp",
    );
  });

  it("shows the paywall to grandfathered users in the upgrade flow", () => {
    expect(
      getSubscribeRouteState({
        ...base,
        hasManagedAccess: true,
        isUpgradeFlow: true,
      }),
    ).toBe("showPaywall");
  });

  it("finalizes instead of re-showing the paywall right after checkout", () => {
    expect(getSubscribeRouteState({ ...base, checkoutCompleted: true })).toBe(
      "finalizing",
    );
  });

  it("shows the paywall to users without managed access", () => {
    expect(getSubscribeRouteState(base)).toBe("showPaywall");
  });
});
