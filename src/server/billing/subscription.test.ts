import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTUMN_PAID_PLAN_ID } from "@/shared/billing";

const { getOrCreateMock } = vi.hoisted(() => ({
  getOrCreateMock: vi.fn(),
}));

vi.mock("@/server/billing/autumn", () => ({
  autumn: {
    customers: {
      getOrCreate: getOrCreateMock,
    },
  },
}));

import {
  getOrCreateOrganizationCustomer,
  hasActivePaidPlan,
} from "./subscription";

describe("subscription billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps access when an active plan is scheduled to cancel", () => {
    expect(
      hasActivePaidPlan({
        subscriptions: [
          {
            planId: AUTUMN_PAID_PLAN_ID,
            status: "active",
            pastDue: false,
            canceledAt: Date.now(),
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects past-due paid plans", () => {
    expect(
      hasActivePaidPlan({
        subscriptions: [
          {
            planId: AUTUMN_PAID_PLAN_ID,
            status: "active",
            pastDue: true,
            canceledAt: null,
          },
        ],
      }),
    ).toBe(false);
  });

  it("does not rewrite the org billing email on lookup", async () => {
    getOrCreateMock.mockResolvedValue({ id: "cust_123" });

    await getOrCreateOrganizationCustomer({
      organizationId: "org_123",
      userEmail: "alice@example.com",
    });

    expect(getOrCreateMock).toHaveBeenCalledWith({
      customerId: "org_123",
      name: "org_123",
    });
  });
});
