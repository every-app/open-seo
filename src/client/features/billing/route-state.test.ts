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
  it("shows an error state on billing lookup failures", () => {
    expect(
      getSubscribeRouteState({
        hasSession: true,
        isCustomerLoading: false,
        isCustomerError: true,
        planStatus: "free",
      }),
    ).toBe("error");
  });

  it("redirects paying customers away from onboarding", () => {
    expect(
      getSubscribeRouteState({
        hasSession: true,
        isCustomerLoading: false,
        isCustomerError: false,
        planStatus: "paid",
      }),
    ).toBe("redirectToApp");
  });

  it("shows welcome page for free plan users", () => {
    expect(
      getSubscribeRouteState({
        hasSession: true,
        isCustomerLoading: false,
        isCustomerError: false,
        planStatus: "free",
      }),
    ).toBe("showWelcome");
  });
});
