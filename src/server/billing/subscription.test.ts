import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTUMN_PAID_PLAN_FEATURE_ID,
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
} from "@/shared/billing";

const { checkMock, getOrCreateMock, kvGetMock, kvPutMock } = vi.hoisted(() => ({
  checkMock: vi.fn(),
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
    customers: {
      getOrCreate: getOrCreateMock,
    },
  },
}));

vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: vi.fn(),
}));

// subscription.ts now imports posthog (for trackUsageCreditSpend); stub it so
// the test doesn't pull in the cloudflare:workers runtime it depends on.
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: vi.fn(),
}));

import {
  assertUsageCreditsAvailable,
  customerHasPaidPlan,
  getOrCreateOrganizationCustomer,
} from "./subscription";

describe("subscription billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kvGetMock.mockResolvedValue(null);
    kvPutMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("checks the paid plan entitlement", async () => {
    checkMock.mockResolvedValue({ allowed: true });

    await expect(customerHasPaidPlan("org_123")).resolves.toBe(true);

    expect(checkMock).toHaveBeenCalledWith({
      customerId: "org_123",
      featureId: AUTUMN_PAID_PLAN_FEATURE_ID,
    });
  });

  it("returns false without retrying when org lacks paid plan", async () => {
    checkMock.mockResolvedValue({ allowed: false });

    await expect(customerHasPaidPlan("org_123")).resolves.toBe(false);
    expect(checkMock).toHaveBeenCalledTimes(1);
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

    const result = assertUsageCreditsAvailable("org_123");
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({ monthlyRemaining: 250 });
    expect(monthlyChecks).toBe(2);
  });

  it("fails closed when the retry still has no monthly balance", async () => {
    vi.useFakeTimers();
    checkMock.mockResolvedValue({ balance: null });

    const result = assertUsageCreditsAvailable("org_123");
    const assertion = expect(result).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
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
    expect(kvPutMock).toHaveBeenCalled();
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

  it("falls back to Autumn when the customer cache read fails", async () => {
    const cacheError = new Error("KV read unavailable");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    kvGetMock.mockRejectedValue(cacheError);
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
    expect(console.warn).toHaveBeenCalledWith(
      "billing.customer-cache-read failed:",
      cacheError,
    );
  });

  it("returns the resolved customer when the customer cache write fails", async () => {
    const cacheError = new Error("KV write unavailable");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    getOrCreateMock.mockResolvedValue({ id: "cust_123" });
    kvPutMock.mockRejectedValue(cacheError);

    await expect(
      getOrCreateOrganizationCustomer({
        organizationId: "org_123",
        userId: "user_123",
        userEmail: "alice@example.com",
      }),
    ).resolves.toEqual({ id: "cust_123" });

    expect(console.warn).toHaveBeenCalledWith(
      "billing.customer-cache-write failed:",
      cacheError,
    );
  });
});
