import { describe, expect, it } from "vitest";
import { AUTUMN_PAID_PLAN_FEATURE_ID } from "@/shared/billing";
import { deriveBillingCustomerStatusSnapshot } from "./customer-status-model";

const paidFlags = (planId: string) => ({
  [AUTUMN_PAID_PLAN_FEATURE_ID]: { planId },
});

describe("deriveBillingCustomerStatusSnapshot", () => {
  it.each([
    {
      name: "an active paid plan is paying",
      flags: paidFlags("yc-plan"),
      subscriptions: [{ planId: "yc-plan", status: "active" }],
      expected: {
        isPaying: true,
        paidPlanId: "yc-plan",
        paidPlanStatus: "active",
        pastDue: false,
        canceledAt: null,
      },
    },
    {
      name: "lifecycle fields come off the paid subscription",
      flags: paidFlags("base-plan"),
      subscriptions: [
        {
          planId: "base-plan",
          status: "active",
          pastDue: true,
          canceledAt: 1_790_000_000_000,
        },
      ],
      expected: { pastDue: true, canceledAt: 1_790_000_000_000 },
    },
    {
      name: "no paid entitlement stays queryable but not paying",
      flags: {},
      subscriptions: [{ planId: "free", status: "active" }],
      expected: { isPaying: false, paidPlanId: null, paidPlanStatus: null },
    },
    {
      name: "a past-due paid plan is not paying",
      flags: paidFlags("base-plan"),
      subscriptions: [{ planId: "base-plan", status: "past_due" }],
      expected: {
        isPaying: false,
        paidPlanId: "base-plan",
        paidPlanStatus: "past_due",
      },
    },
  ])("$name", ({ flags, subscriptions, expected }) => {
    expect(
      deriveBillingCustomerStatusSnapshot({
        id: "org_123",
        flags,
        subscriptions,
      }),
    ).toMatchObject({ organizationId: "org_123", ...expected });
  });

  it("prefers the active row when the plan has several subscriptions", () => {
    const snapshot = deriveBillingCustomerStatusSnapshot({
      id: "org_789",
      flags: paidFlags("base-plan"),
      subscriptions: [
        { planId: "base-plan", status: "scheduled" },
        { planId: "base-plan", status: "active" },
      ],
    });

    expect(snapshot.isPaying).toBe(true);
    expect(snapshot.paidPlanStatus).toBe("active");
  });
});
