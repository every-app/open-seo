import { describe, expect, it } from "vitest";
import {
  deriveBillingLifecycleEvents,
  getBillingState,
} from "./lifecycle-events";

const snapshot = (
  overrides: Partial<Parameters<typeof deriveBillingLifecycleEvents>[1]> = {},
) => ({
  paidPlanId: "base-plan",
  paidPlanStatus: "active",
  isPaying: true,
  pastDue: false,
  canceledAt: null,
  ...overrides,
});

const free = snapshot({
  paidPlanId: null,
  paidPlanStatus: null,
  isPaying: false,
});

describe("deriveBillingLifecycleEvents", () => {
  it("starts a subscription when a priced plan first activates", () => {
    expect(deriveBillingLifecycleEvents(free, snapshot())).toEqual([
      { name: "subscription_started", planId: "base-plan" },
    ]);
  });

  it("ignores unpriced paid plans and upgrades between priced plans", () => {
    expect(
      deriveBillingLifecycleEvents(
        free,
        snapshot({ paidPlanId: "friends_and_family_2" }),
      ),
    ).toEqual([]);
    expect(
      deriveBillingLifecycleEvents(
        snapshot(),
        snapshot({ paidPlanId: "yc-plan" }),
      ),
    ).toEqual([]);
  });

  it("reports a payment failure once when the subscription goes past due", () => {
    const pastDue = snapshot({ pastDue: true });
    expect(deriveBillingLifecycleEvents(snapshot(), pastDue)).toEqual([
      { name: "payment_failed", planId: "base-plan" },
    ]);
    expect(deriveBillingLifecycleEvents(pastDue, pastDue)).toEqual([]);
  });

  it("reports a cancellation once, whether scheduled or immediate", () => {
    const canceling = snapshot({ canceledAt: 1_790_000_000_000 });
    const canceled = { name: "subscription_canceled", planId: "base-plan" };
    expect(deriveBillingLifecycleEvents(snapshot(), canceling)).toEqual([
      canceled,
    ]);
    expect(deriveBillingLifecycleEvents(snapshot(), free)).toEqual([canceled]);
    // Period end arrives: the cancellation was already reported.
    expect(deriveBillingLifecycleEvents(canceling, free)).toEqual([]);
  });

  it("stays silent when a past-due subscription expires", () => {
    expect(
      deriveBillingLifecycleEvents(snapshot({ pastDue: true }), free),
    ).toEqual([]);
  });
});

describe("getBillingState", () => {
  it("summarises the paid subscription for audience filters", () => {
    expect(getBillingState(free)).toBe("none");
    expect(getBillingState(snapshot())).toBe("active");
    expect(getBillingState(snapshot({ pastDue: true }))).toBe("past_due");
    expect(getBillingState(snapshot({ canceledAt: 1 }))).toBe("canceling");
    expect(
      getBillingState(snapshot({ paidPlanStatus: "expired", isPaying: false })),
    ).toBe("expired");
  });
});
