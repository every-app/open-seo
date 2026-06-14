import { describe, expect, it } from "vitest";
import { AUTUMN_PAID_PLAN_ID } from "@/shared/billing";
import { deriveBillingCustomerStatusSnapshot } from "./customer-status-model";

describe("deriveBillingCustomerStatusSnapshot", () => {
  it("marks customers with an active paid subscription as paying", () => {
    const snapshot = deriveBillingCustomerStatusSnapshot({
      id: "org_123",
      subscriptions: [{ planId: AUTUMN_PAID_PLAN_ID, status: "active" }],
    });

    expect(snapshot).toMatchObject({
      organizationId: "org_123",
      isPaying: true,
      paidPlanId: AUTUMN_PAID_PLAN_ID,
      paidPlanStatus: "active",
    });
  });

  it("preserves the full customer payload in customerJson", () => {
    const snapshot = deriveBillingCustomerStatusSnapshot({
      id: "org_123",
      email: "alice@example.com",
      stripeId: "cus_123",
      subscriptions: [{ planId: AUTUMN_PAID_PLAN_ID, status: "active" }],
    });

    expect(JSON.parse(snapshot.customerJson)).toMatchObject({
      id: "org_123",
      email: "alice@example.com",
      stripeId: "cus_123",
    });
  });

  it("keeps non-paid customers queryable but not paying", () => {
    const snapshot = deriveBillingCustomerStatusSnapshot({
      id: "org_123",
      subscriptions: [{ planId: "free", status: "active" }],
    });

    expect(snapshot.isPaying).toBe(false);
    expect(snapshot.paidPlanId).toBeNull();
    expect(snapshot.paidPlanStatus).toBeNull();
  });

  it("records a scheduled (not-yet-active) paid plan as not paying", () => {
    const snapshot = deriveBillingCustomerStatusSnapshot({
      id: "org_456",
      subscriptions: [{ planId: AUTUMN_PAID_PLAN_ID, status: "scheduled" }],
    });

    expect(snapshot).toMatchObject({
      organizationId: "org_456",
      isPaying: false,
      paidPlanId: AUTUMN_PAID_PLAN_ID,
      paidPlanStatus: "scheduled",
    });
  });

  it("prefers an active paid subscription when multiple paid rows exist", () => {
    const snapshot = deriveBillingCustomerStatusSnapshot({
      id: "org_789",
      subscriptions: [
        { planId: AUTUMN_PAID_PLAN_ID, status: "scheduled" },
        { planId: AUTUMN_PAID_PLAN_ID, status: "active" },
      ],
    });

    expect(snapshot.isPaying).toBe(true);
    expect(snapshot.paidPlanId).toBe(AUTUMN_PAID_PLAN_ID);
    expect(snapshot.paidPlanStatus).toBe("active");
  });
});
