import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTUMN_PAID_PLAN_FEATURE_ID,
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
} from "@/shared/billing";

interface CheckCallArg {
  featureId: string;
  requiredBalance?: number;
  sendEvent?: boolean;
  lock?: { lockId: string; enabled: true; expiresAt?: number };
}

interface FinalizeCallArg {
  lockId: string;
  action: "confirm" | "release";
  overrideValue?: number;
}

const { checkMock, finalizeMock, getOrCreateMock, kvGetMock, kvPutMock } =
  vi.hoisted(() => ({
    checkMock:
      vi.fn<(arg: CheckCallArg, options?: unknown) => Promise<unknown>>(),
    finalizeMock:
      vi.fn<
        (
          arg: FinalizeCallArg,
          options?: unknown,
        ) => Promise<{ success: boolean }>
      >(),
    getOrCreateMock: vi.fn(),
    kvGetMock: vi.fn(),
    kvPutMock: vi.fn(),
  }));

vi.mock("cloudflare:workers", () => ({
  env: { KV: { get: kvGetMock, put: kvPutMock } },
}));

vi.mock("@/server/billing/autumn", () => ({
  autumn: {
    check: checkMock,
    balances: { finalize: finalizeMock },
    customers: {
      getOrCreate: getOrCreateMock,
    },
  },
  AUTUMN_TRACK_RETRY_OPTIONS: {},
}));

// subscription.ts now imports posthog (for trackUsageCreditSpend); stub it so
// the test doesn't pull in the cloudflare:workers runtime it depends on.
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: vi.fn(),
}));

import { captureServerEvent } from "@/server/lib/posthog";
import { AUTUMN_TRACK_RETRY_OPTIONS } from "@/server/billing/autumn";
import {
  customerHasPaidPlan,
  getOrCreateOrganizationCustomer,
  checkUsageCreditsDepleted,
  reserveUsageCredits,
  settleUsageCredits,
} from "./subscription";

const customer = {
  organizationId: "org_123",
  userId: "user_123",
  userEmail: "alice@example.com",
};

describe("subscription billing", () => {
  beforeEach(() => {
    kvGetMock.mockResolvedValue(null);
    kvPutMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("recovers from a degraded negative read when retryDenied is set", async () => {
    vi.useFakeTimers();
    checkMock
      .mockResolvedValueOnce({ allowed: false })
      .mockResolvedValueOnce({ allowed: true });

    const result = customerHasPaidPlan("org_123", { retryDenied: true });
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe(true);
    expect(checkMock).toHaveBeenCalledTimes(2);
    expect(checkMock).toHaveBeenCalledWith({
      customerId: "org_123",
      featureId: AUTUMN_PAID_PLAN_FEATURE_ID,
    });
  });

  it("retries a missing monthly balance once", async () => {
    vi.useFakeTimers();
    let monthlyChecks = 0;
    checkMock.mockImplementation(
      async ({ featureId }: { featureId: string }) => {
        if (featureId === AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID) {
          return { balance: null };
        }
        if (featureId === AUTUMN_SEO_DATA_BALANCE_FEATURE_ID) {
          monthlyChecks += 1;
          return monthlyChecks === 1
            ? { balance: null }
            : { balance: { remaining: 250 } };
        }
        throw new Error(`Unexpected feature ${featureId}`);
      },
    );

    const result = checkUsageCreditsDepleted(customer);
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({
      depleted: false,
      monthlyRemaining: 250,
    });
    expect(monthlyChecks).toBe(2);
  });

  it("fails closed when the retry still has no monthly balance", async () => {
    vi.useFakeTimers();
    checkMock.mockResolvedValue({ balance: null });

    const result = checkUsageCreditsDepleted(customer);
    const assertion = expect(result).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
    await vi.runAllTimersAsync();

    await assertion;
    expect(checkMock).toHaveBeenCalledTimes(3);
  });

  it("looks up the billing customer by organization id", async () => {
    getOrCreateMock.mockResolvedValue({ id: "cust_123" });

    await getOrCreateOrganizationCustomer({
      organizationId: "org_123",
      userId: "user_123",
      userEmail: "alice@example.com",
    });

    expect(getOrCreateMock).toHaveBeenCalledWith({
      customerId: "org_123",
      email: "alice@example.com",
    });
  });

  it("skips the Autumn round trip when the customer was recently ensured", async () => {
    kvGetMock.mockResolvedValue("1");

    const result = await getOrCreateOrganizationCustomer({
      organizationId: "org_123",
      userId: "user_123",
      userEmail: "alice@example.com",
    });

    expect(result).toEqual({ id: "org_123" });
    expect(getOrCreateMock).not.toHaveBeenCalled();
  });

  // A KV outage must never block billing; the customer still resolves.
  it.each([
    ["read", () => kvGetMock.mockRejectedValue(new Error("KV unavailable"))],
    ["write", () => kvPutMock.mockRejectedValue(new Error("KV unavailable"))],
  ])(
    "falls back to Autumn when the customer cache %s fails",
    async (_op, breakCache) => {
      vi.spyOn(console, "warn").mockImplementation(() => undefined);
      breakCache();
      getOrCreateMock.mockResolvedValue({ id: "cust_123" });

      await expect(
        getOrCreateOrganizationCustomer({
          organizationId: "org_123",
          userId: "user_123",
          userEmail: "alice@example.com",
        }),
      ).resolves.toEqual({ id: "cust_123" });
      expect(getOrCreateMock).toHaveBeenCalledWith({
        customerId: "org_123",
        email: "alice@example.com",
      });
    },
  );
});

describe("reserveUsageCredits", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds the whole estimate on topup when monthly is short", async () => {
    checkMock.mockImplementation(async ({ featureId }) =>
      featureId === AUTUMN_SEO_DATA_BALANCE_FEATURE_ID
        ? { allowed: false, balance: { remaining: 40 } }
        : { allowed: true, balance: { remaining: 900 } },
    );

    const {
      holds: [hold],
    } = await reserveUsageCredits({
      customer,
      customerId: "org_123",
      callCredits: [100],
      creditFeature: "backlinks",
    });

    expect(hold).toMatchObject({
      featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
      estimatedCredits: 100,
    });
    const topupCall = checkMock.mock.calls.find(
      ([arg]) => arg.featureId === AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
    )![0];
    expect(topupCall).toMatchObject({
      requiredBalance: 100,
      sendEvent: true,
      lock: { lockId: hold.lockId, enabled: true },
    });
    expect(topupCall.lock?.expiresAt).toBeGreaterThan(Date.now() + 29 * 60_000);
  });

  it("places each call where its own hold would land: monthly first, else top-up, else refused", async () => {
    // Monthly 3, top-up 20; calls of 7, 3 and 30 credits. Per call: the 7
    // misses monthly and lands on top-up, the 3 fits monthly, the 30 fits
    // neither. Top-up alone could cover 7 + 3 but must not take the 3.
    const remaining = { monthly: 3, topup: 20 };
    checkMock.mockImplementation(async ({ featureId, requiredBalance = 1 }) => {
      const balance =
        featureId === AUTUMN_SEO_DATA_BALANCE_FEATURE_ID
          ? remaining.monthly
          : remaining.topup;
      return {
        allowed: balance >= requiredBalance,
        balance: { remaining: balance },
      };
    });

    const reserved = await reserveUsageCredits({
      customer,
      customerId: "org_123",
      callCredits: [7, 3, 30],
    });

    expect(reserved).toMatchObject({
      holds: [
        {
          featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
          estimatedCredits: 3,
          callIndexes: [1],
        },
        {
          featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
          estimatedCredits: 7,
          callIndexes: [0],
        },
      ],
      refusedCalls: [2],
    });
    expect(vi.mocked(captureServerEvent).mock.calls[0][0]).toMatchObject({
      event: "usage:credits_gate_refused",
      properties: { estimated_credits: 30 },
    });
  });

  it("releases an earlier hold when a later one fails", async () => {
    checkMock.mockImplementation(async ({ featureId, requiredBalance = 1 }) => {
      if (featureId !== AUTUMN_SEO_DATA_BALANCE_FEATURE_ID) {
        throw new Error("socket hang up");
      }
      return { allowed: requiredBalance <= 3, balance: { remaining: 3 } };
    });
    finalizeMock.mockResolvedValue({ success: true });

    await expect(
      reserveUsageCredits({
        customer,
        customerId: "org_123",
        callCredits: [3, 3],
      }),
    ).rejects.toThrow("socket hang up");

    const monthlyHold = checkMock.mock.calls[1][0];
    expect(monthlyHold.requiredBalance).toBe(3);
    expect(finalizeMock.mock.calls.map(([arg]) => arg)).toMatchObject([
      { lockId: monthlyHold.lock?.lockId, action: "release" },
    ]);
  });

  it("refuses when neither pool covers the estimate and reports it", async () => {
    // An org that never topped up reads allowed:false + balance:null on
    // topup_credits: a refusal, not a broken read.
    checkMock.mockImplementation(async ({ featureId }) =>
      featureId === AUTUMN_SEO_DATA_BALANCE_FEATURE_ID
        ? { allowed: false, balance: { remaining: 40 } }
        : { allowed: false, balance: null },
    );

    await expect(
      reserveUsageCredits({
        customer,
        customerId: "org_123",
        callCredits: [100],
        creditFeature: "backlinks",
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CREDITS" });

    expect(vi.mocked(captureServerEvent).mock.calls[0][0]).toMatchObject({
      event: "usage:credits_gate_refused",
      properties: {
        estimated_credits: 100,
        monthly_remaining: 40,
        topup_remaining: 0,
        credit_feature: "backlinks",
      },
    });
  });

  it("retries a fail-open read once with the same lock, then fails closed", async () => {
    vi.useFakeTimers();
    checkMock.mockResolvedValue({ allowed: true, balance: null });

    const result = reserveUsageCredits({
      customer,
      customerId: "org_123",
      callCredits: [100],
    });
    const assertion = expect(result).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
    await vi.runAllTimersAsync();

    await assertion;
    expect(checkMock).toHaveBeenCalledTimes(2);
    const [first, second] = checkMock.mock.calls.map(
      ([arg]) => arg.lock?.lockId,
    );
    expect(first).toBe(second);
    // 429-only retry: an SDK-level 5xx replay of the same lock would throw
    // lock_already_exists from the first attempt, outside the catch above.
    for (const [, options] of checkMock.mock.calls) {
      expect(options).toBe(AUTUMN_TRACK_RETRY_OPTIONS);
    }
  });

  it("treats lock_already_exists on the retry as the first hold having landed", async () => {
    vi.useFakeTimers();
    const lockExists = Object.assign(new Error("Status 409"), {
      body: '{"message":"Lock already exists","code":"lock_already_exists"}',
    });
    checkMock
      .mockResolvedValueOnce({ allowed: true, balance: null })
      .mockRejectedValueOnce(lockExists);

    const result = reserveUsageCredits({
      customer,
      customerId: "org_123",
      callCredits: [100],
    });
    await vi.runAllTimersAsync();

    await expect(result).resolves.toMatchObject({
      holds: [
        {
          featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
          lockId: checkMock.mock.calls[0][0].lock?.lockId,
        },
      ],
    });
    expect(checkMock).toHaveBeenCalledTimes(2);
  });
});

describe("settleUsageCredits", () => {
  const hold = {
    lockId: "dfs_org_123_lock",
    featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
    estimatedCredits: 100,
    callIndexes: [0],
  } as const;
  const cost = { costUsd: 0.05, path: ["v3", "backlinks", "summary", "live"] };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("releases the hold when nothing was billed", async () => {
    finalizeMock.mockResolvedValue({ success: true });

    await settleUsageCredits({ customer, hold, costs: [] });

    expect(finalizeMock).toHaveBeenCalledTimes(1);
    expect(finalizeMock.mock.calls[0][0]).toMatchObject({
      lockId: hold.lockId,
      action: "release",
    });
    expect(finalizeMock.mock.calls[0][0]).not.toHaveProperty("overrideValue");
    // The 429-only retry rides on the per-call options.
    expect(finalizeMock.mock.calls[0][1]).toBe(AUTUMN_TRACK_RETRY_OPTIONS);
    expect(captureServerEvent).not.toHaveBeenCalled();
  });

  it("treats 'Lock not found' on the retry as the first attempt having landed", async () => {
    vi.useFakeTimers();
    const lockGone = Object.assign(new Error("Status 400"), {
      body: '{"message":"Lock not found for ID: dfs_org_123_lock","code":"invalid_request"}',
    });
    finalizeMock
      .mockRejectedValueOnce(new Error("socket hang up"))
      .mockRejectedValueOnce(lockGone);

    const result = settleUsageCredits({
      customer,
      hold,
      creditFeature: "backlinks",
      costs: [cost],
    });
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBeUndefined();
    expect(captureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "usage:credits_consume" }),
    );
  });

  it("logs and resolves when finalize keeps failing", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    finalizeMock.mockRejectedValue(new Error("Status 503"));

    const result = settleUsageCredits({
      customer,
      hold,
      creditFeature: "backlinks",
      costs: [cost],
    });
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBeUndefined();
    expect(finalizeMock).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith(
      "[autumn] finalize failed",
      expect.objectContaining({ lockId: hold.lockId, held: 100, actual: 64 }),
    );
    expect(captureServerEvent).not.toHaveBeenCalled();
  });
});
