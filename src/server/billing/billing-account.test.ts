import { describe, expect, it, vi } from "vitest";
import {
  AUTUMN_MANAGED_ACCESS_FEATURE_ID,
  AUTUMN_PAID_PLAN_FEATURE_ID,
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
} from "@/shared/billing";

const { getOrCreateMock } = vi.hoisted(() => ({ getOrCreateMock: vi.fn() }));

vi.mock("@/server/billing/autumn", () => ({
  autumn: { customers: { getOrCreate: getOrCreateMock } },
}));

import { getOrganizationBillingAccount } from "./billing-account";

const context = {
  organizationId: "org_1",
  userEmail: "owner@example.com",
  userId: "user_1",
};

describe("getOrganizationBillingAccount", () => {
  it("follows the paid entitlement for the plan and reads credits in USD", async () => {
    getOrCreateMock.mockResolvedValueOnce({
      id: "org_1",
      flags: {
        [AUTUMN_PAID_PLAN_FEATURE_ID]: { planId: "friends_and_family_2" },
        [AUTUMN_MANAGED_ACCESS_FEATURE_ID]: {},
      },
      balances: {
        [AUTUMN_SEO_DATA_BALANCE_FEATURE_ID]: {
          granted: 20000,
          remaining: 1500,
          nextResetAt: 1_790_000_000_000,
        },
        [AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID]: { remaining: 2500 },
      },
      subscriptions: [{ planId: "friends_and_family_2", pastDue: true }],
      purchases: [],
      sendEmailReceipts: true,
    });

    await expect(getOrganizationBillingAccount(context)).resolves.toEqual({
      planStatus: "paid",
      paidPlanId: "friends_and_family_2",
      monthlyCreditsUsd: 20,
      monthlyRemainingUsd: 1.5,
      topUpRemainingUsd: 2.5,
      hasManagedAccess: true,
      isPastDue: true,
      monthlyRefillsAt: 1_790_000_000_000,
      invoiceEmailsEnabled: true,
      autoReload: null,
      // No top-up purchase to price a reload from, so turning it on buys one.
      autoReloadPrimesOnEnable: true,
    });
    // The organization is the billing identity.
    expect(getOrCreateMock).toHaveBeenCalledWith({
      customerId: "org_1",
      email: "owner@example.com",
    });

    getOrCreateMock.mockResolvedValueOnce({
      id: "org_1",
      flags: { [AUTUMN_MANAGED_ACCESS_FEATURE_ID]: {} },
      balances: {},
      subscriptions: [{ pastDue: false }],
      purchases: [],
    });

    await expect(getOrganizationBillingAccount(context)).resolves.toMatchObject(
      { planStatus: "free", paidPlanId: null, hasManagedAccess: true },
    );
  });

  it("gives no refill date for a paid plan canceled at period end", async () => {
    getOrCreateMock.mockResolvedValueOnce({
      id: "org_1",
      flags: { [AUTUMN_PAID_PLAN_FEATURE_ID]: { planId: "base-plan" } },
      balances: {
        [AUTUMN_SEO_DATA_BALANCE_FEATURE_ID]: {
          nextResetAt: 1_790_000_000_000,
        },
      },
      subscriptions: [{ planId: "base-plan", canceledAt: 1_789_000_000_000 }],
      purchases: [],
    });

    await expect(getOrganizationBillingAccount(context)).resolves.toMatchObject(
      { monthlyRefillsAt: null },
    );
  });

  it("reads auto-reload in USD with the cycle's spend against the budget and the last failure", async () => {
    getOrCreateMock.mockResolvedValueOnce({
      id: "org_1",
      flags: {},
      balances: {
        [AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID]: { remaining: 12000 },
      },
      subscriptions: [],
      purchases: [{ planId: "credit-top-up" }],
      billingControls: {
        autoTopups: [
          {
            featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
            enabled: true,
            threshold: 5000,
            quantity: 20000,
            purchaseLimit: { interval: "month", intervalCount: 1, limit: 11 },
          },
        ],
        usageLimits: [
          {
            featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
            enabled: true,
            limit: 100000,
            interval: "month",
            anchor: "billing_cycle",
            usage: 42500,
          },
        ],
      },
      metadata: { autoReloadFailure: { reason: "charge_failed", at: 1_000 } },
    });

    await expect(getOrganizationBillingAccount(context)).resolves.toMatchObject(
      {
        autoReload: {
          enabled: true,
          thresholdUsd: 5,
          amountUsd: 20,
          monthlyLimitUsd: 100,
          spentUsd: 42.5,
          failure: { reason: "charge_failed", at: 1_000 },
        },
        // Credits above the threshold: the failed reload is retried by
        // Autumn when they run low, not charged again now.
        autoReloadPrimesOnEnable: false,
      },
    );
  });

  it("fails instead of showing the empty customer Autumn returns when it fails open", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    getOrCreateMock.mockResolvedValueOnce({
      id: null,
      flags: {},
      balances: {},
      subscriptions: [],
    });

    await expect(getOrganizationBillingAccount(context)).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
  });
});
