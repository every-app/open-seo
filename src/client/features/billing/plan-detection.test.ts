import { describe, expect, it } from "vitest";
import { AUTUMN_PAID_PLAN_FEATURE_ID } from "@/shared/billing";
import { getCustomerPlanStatus } from "./plan-detection";

describe("getCustomerPlanStatus", () => {
  it("treats a customer without the paid entitlement as free", () => {
    expect(getCustomerPlanStatus(undefined)).toBe("free");
    expect(getCustomerPlanStatus({ flags: {} })).toBe("free");
  });

  it("treats any plan granting the paid entitlement as paid", () => {
    expect(
      getCustomerPlanStatus({
        flags: {
          [AUTUMN_PAID_PLAN_FEATURE_ID]: {
            planId: "friends_and_family_2",
          },
        },
      }),
    ).toBe("paid");
  });
});
