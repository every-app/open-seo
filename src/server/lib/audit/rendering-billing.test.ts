import { beforeEach, describe, expect, it, vi } from "vitest";
import type { finalizeHold, holdCredits } from "@/server/billing/subscription";

const mocks = vi.hoisted(() => ({
  isHosted: vi.fn(),
  getUsageCreditsRemaining: vi.fn(),
  holdCredits: vi.fn<typeof holdCredits>(),
  finalizeHold: vi.fn<typeof finalizeHold>(),
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHosted,
}));
vi.mock("@/server/billing/subscription", () => ({
  getOrCreateOrganizationCustomer: vi.fn().mockResolvedValue({ id: "org" }),
  getUsageCreditsRemaining: mocks.getUsageCreditsRemaining,
  holdCredits: mocks.holdCredits,
  finalizeHold: mocks.finalizeHold,
}));
vi.mock("@/server/lib/posthog", () => ({ captureServerEvent: vi.fn() }));

import {
  lockRenderingCredits,
  settleRenderingLocks,
} from "./rendering-billing";
import { estimateRenderingCredits } from "@/shared/audit-rendering";

const customer = {
  userId: "user",
  userEmail: "user@example.com",
  organizationId: "org",
};
// 100 pages hold 384 credits: every page falling back to Context.
const lockFor100Pages = () =>
  lockRenderingCredits({ customer, auditId: "audit", maxPages: 100 });
const monthlyLock = {
  lockId: "monthly",
  featureId: "usage_credits" as const,
  estimatedCredits: 300,
  callIndexes: [],
};
const topupLock = {
  lockId: "topup",
  featureId: "topup_credits" as const,
  estimatedCredits: 84,
  callIndexes: [],
};

beforeEach(() => {
  mocks.isHosted.mockResolvedValue(true);
  mocks.getUsageCreditsRemaining.mockResolvedValue({
    monthlyRemaining: 300,
    topupRemaining: 1_000,
  });
  mocks.holdCredits.mockImplementation(
    async ({ featureId, estimatedCredits }) => ({
      hold: { lockId: featureId, featureId, estimatedCredits, callIndexes: [] },
      allowed: true,
      balance: null,
    }),
  );
  mocks.finalizeHold.mockResolvedValue({ landed: true });
});

describe("rendering estimate", () => {
  it("ranges from every page on Cloudflare to every page on Context", () => {
    expect(estimateRenderingCredits(100)).toEqual({ low: 64, high: 384 });
  });
});

describe("rendering credit lock", () => {
  it("leaves self-hosted rendering unmetered", async () => {
    mocks.isHosted.mockResolvedValue(false);
    expect(await lockFor100Pages()).toEqual([]);
    expect(mocks.holdCredits).not.toHaveBeenCalled();
  });

  it("holds the worst case from the monthly balance first, then top-up, for at most 24 hours", async () => {
    const locks = await lockFor100Pages();
    expect(
      locks.map((lock) => [lock.featureId, lock.estimatedCredits]),
    ).toEqual([
      ["usage_credits", 300],
      ["topup_credits", 84],
    ]);
    const ttlMs = mocks.holdCredits.mock.calls[0][0].ttlMs ?? 0;
    expect(ttlMs).toBeGreaterThan(60 * 60_000);
    expect(ttlMs).toBeLessThanOrEqual(24 * 60 * 60_000);
  });

  it("refuses before holding anything when both balances together fall short", async () => {
    mocks.getUsageCreditsRemaining.mockResolvedValue({
      monthlyRemaining: 300,
      topupRemaining: 83,
    });
    const error = await lockFor100Pages().catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: "INSUFFICIENT_CREDITS" });
    expect(String(error)).toContain("needs $0.39 of credits");
    expect(mocks.holdCredits).not.toHaveBeenCalled();
  });

  it("releases the monthly hold when the top-up hold is refused", async () => {
    mocks.holdCredits
      .mockResolvedValueOnce({
        hold: monthlyLock,
        allowed: true,
        balance: null,
      })
      .mockResolvedValueOnce({
        hold: topupLock,
        allowed: false,
        balance: null,
      });
    await expect(lockFor100Pages()).rejects.toMatchObject({
      code: "INSUFFICIENT_CREDITS",
    });
    expect(mocks.finalizeHold).toHaveBeenCalledTimes(1);
    expect(mocks.finalizeHold).toHaveBeenCalledWith(
      monthlyLock,
      0,
      expect.anything(),
    );
  });
});

describe("rendering settlement", () => {
  const locks = [monthlyLock, topupLock];

  it("confirms the credits used from the monthly hold and releases the rest", async () => {
    // 10 Cloudflare attempts and 2 Context credits cost $0.01: 13 credits.
    await settleRenderingLocks({
      customer,
      auditId: "audit",
      locks,
      usage: { cloudflareAttempts: 10, contextCredits: 2 },
    });
    expect(
      mocks.finalizeHold.mock.calls.map(([lock, credits]) => [
        lock.lockId,
        credits,
      ]),
    ).toEqual([
      ["monthly", 13],
      ["topup", 0],
    ]);
  });

  it("never charges more than the hold, and survives a finalize that did not land", async () => {
    mocks.finalizeHold.mockResolvedValueOnce({
      landed: false,
      error: new Error("Autumn down"),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await settleRenderingLocks({
      customer,
      auditId: "audit",
      locks,
      usage: { cloudflareAttempts: 200, contextCredits: 200 },
    });
    expect(mocks.finalizeHold).toHaveBeenLastCalledWith(
      topupLock,
      84,
      expect.anything(),
    );
  });
});
