import { describe, expect, it } from "vitest";
import {
  getBillingLoopsContactProperties,
  LOOPS_BILLING_PLAN_NONE,
} from "./loops-contact-properties";

describe("getBillingLoopsContactProperties", () => {
  it("maps Autumn billing fields to Loops custom properties", () => {
    expect(
      getBillingLoopsContactProperties({
        paidPlanId: "base-plan",
        paidPlanStatus: "active",
      }),
    ).toEqual({
      billingPlanId: "base-plan",
      billingPlanStatus: "active",
    });
  });

  it("uses explicit none values when the customer has no paid plan", () => {
    expect(
      getBillingLoopsContactProperties({
        paidPlanId: null,
        paidPlanStatus: null,
      }),
    ).toEqual({
      billingPlanId: LOOPS_BILLING_PLAN_NONE,
      billingPlanStatus: LOOPS_BILLING_PLAN_NONE,
    });
  });
});
