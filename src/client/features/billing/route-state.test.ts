import { describe, expect, it } from "vitest";
import { getBillingRouteState, getSubscribeRouteState } from "./route-state";

describe("getBillingRouteState", () => {
  it("redirects unpaid customers after a successful customer lookup", () => {
    expect(
      getBillingRouteState({
        hasSession: true,
        isSessionPending: false,
        isCustomerLoading: false,
        isCustomerError: false,
        hasManagedServiceAccess: false,
      }),
    ).toBe("redirectToSubscribe");
  });

  it("shows an error state instead of redirecting on billing lookup failures", () => {
    expect(
      getBillingRouteState({
        hasSession: true,
        isSessionPending: false,
        isCustomerLoading: false,
        isCustomerError: true,
        hasManagedServiceAccess: false,
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
        hasManagedServiceAccess: false,
      }),
    ).toBe("loading");

    expect(
      getBillingRouteState({
        hasSession: true,
        isSessionPending: false,
        isCustomerLoading: true,
        isCustomerError: false,
        hasManagedServiceAccess: false,
      }),
    ).toBe("loading");
  });
});

describe("getSubscribeRouteState", () => {
  it("shows an error state instead of a subscribe CTA on billing lookup failures", () => {
    expect(
      getSubscribeRouteState({
        hasSession: true,
        isCustomerLoading: false,
        isCustomerError: true,
        hasManagedServiceAccess: false,
      }),
    ).toBe("error");
  });

  it("redirects paying customers away from onboarding", () => {
    expect(
      getSubscribeRouteState({
        hasSession: true,
        isCustomerLoading: false,
        isCustomerError: false,
        hasManagedServiceAccess: true,
      }),
    ).toBe("redirectToApp");
  });
});
