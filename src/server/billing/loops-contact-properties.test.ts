import { describe, expect, it } from "vitest";
import {
  getBillingLoopsContactProperties,
  LOOPS_BILLING_PLAN_NONE,
} from "./loops-contact-properties";

describe("getBillingLoopsContactProperties", () => {
  it("uses explicit none values when the customer has no paid plan", () => {
    expect(
      getBillingLoopsContactProperties({
        paidPlanId: null,
        paidPlanStatus: null,
        pastDue: false,
        canceledAt: null,
      }),
    ).toEqual({
      billingPlanId: LOOPS_BILLING_PLAN_NONE,
      billingPlanStatus: LOOPS_BILLING_PLAN_NONE,
      billingState: "none",
    });
  });
});
