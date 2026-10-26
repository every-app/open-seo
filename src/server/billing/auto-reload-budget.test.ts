import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
} from "@/shared/billing";

const { checkMock } = vi.hoisted(() => ({
  checkMock: vi.fn<(arg: { featureId: string }) => Promise<unknown>>(),
}));

vi.mock("cloudflare:workers", () => ({
  env: { KV: { get: vi.fn(), put: vi.fn() } },
}));
vi.mock("@/server/billing/autumn", () => ({
  autumn: {
    check: checkMock,
    balances: { finalize: vi.fn() },
    customers: { getOrCreate: vi.fn() },
  },
  AUTUMN_TRACK_RETRY_OPTIONS: {},
}));
vi.mock("@/server/lib/posthog", () => ({ captureServerEvent: vi.fn() }));

import { captureServerEvent } from "@/server/lib/posthog";
import { getUsageCreditsRemaining, reserveUsageCredits } from "./subscription";

const customer = {
  organizationId: "org_1",
  userId: "user_1",
  userEmail: "owner@example.com",
};

// The monthly auto-reload budget is Autumn's usage limit on the top-up
// balance: a check it refuses comes back with the balance still showing
// credits. What the metering seams make of that.
describe("auto-reload budget", () => {
  beforeEach(() => {
    // Monthly credits gone; $12 of top-up credits the budget holds back.
    checkMock.mockImplementation(async ({ featureId }) =>
      featureId === AUTUMN_SEO_DATA_BALANCE_FEATURE_ID
        ? { allowed: false, balance: { remaining: 0 } }
        : { allowed: false, balance: { remaining: 12000 } },
    );
  });

  it("reads a top-up balance that refuses with credits left as nothing to spend", async () => {
    await expect(getUsageCreditsRemaining("org_1")).resolves.toEqual({
      monthlyRemaining: 0,
      topupRemaining: 0,
      topupBudgetReached: true,
    });
  });

  it("refuses a hold as the budget, without retrying it smaller", async () => {
    const refused = reserveUsageCredits({
      customer,
      customerId: "org_1",
      callCredits: [100],
    });

    await expect(refused).rejects.toMatchObject({
      code: "INSUFFICIENT_CREDITS",
    });
    await expect(refused).rejects.toThrow(/budget/);
    const topupChecks = checkMock.mock.calls.filter(
      ([arg]) => arg.featureId === AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
    );
    expect(topupChecks).toHaveLength(1);
    expect(vi.mocked(captureServerEvent).mock.calls[0][0]).toMatchObject({
      event: "usage:credits_gate_refused",
      properties: { reason: "monthly_budget_reached", topup_remaining: 12000 },
    });
  });

  it("reads a refused smaller hold as the budget too", async () => {
    // $16 asked of a $12 balance: the first refusal reads as a short
    // balance, the retry fits the balance, and the budget refuses that one.
    const refused = reserveUsageCredits({
      customer,
      customerId: "org_1",
      callCredits: [8000, 8000],
    });

    await expect(refused).rejects.toThrow(/budget/);
    const topupChecks = checkMock.mock.calls.filter(
      ([arg]) => arg.featureId === AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
    );
    expect(topupChecks).toHaveLength(2);
    expect(vi.mocked(captureServerEvent).mock.calls[0][0]).toMatchObject({
      properties: { reason: "monthly_budget_reached" },
    });
  });
});
