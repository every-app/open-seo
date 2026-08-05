import { describe, expect, it, vi } from "vitest";
import type {
  StripeOneOffPurchase,
  StripeRefund,
  StripeSubscription,
} from "@/server/lib/stripeClient";
import {
  attributeRefundsToProduct,
  computeStripeOneOffMetrics,
  computeStripeRefundMetrics,
  computeStripeSubscriptionMetrics,
} from "./StripeRevenueService";

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock(
  "@/server/features/revenue/repositories/StripeConnectionRepository",
  () => ({ StripeConnectionRepository: {} }),
);

const NOW = new Date("2026-08-03T00:00:00.000Z");
const NOW_S = Math.floor(NOW.getTime() / 1000);
const DAY_S = 24 * 60 * 60;

const PRODUCT = "prod_sub";

function subscription(
  overrides: Partial<StripeSubscription> & {
    item?: Partial<StripeSubscription["items"][number]>;
  } = {},
): StripeSubscription {
  const { item, ...rest } = overrides;
  return {
    id: crypto.randomUUID(),
    status: "active",
    created: NOW_S - 90 * DAY_S,
    canceledAt: null,
    items: [
      {
        productId: PRODUCT,
        unitAmount: 900,
        currency: "usd",
        interval: "month",
        intervalCount: 1,
        quantity: 1,
        ...item,
      },
    ],
    ...rest,
  };
}

describe("computeStripeSubscriptionMetrics", () => {
  it("scopes to the mapped product", () => {
    const metrics = computeStripeSubscriptionMetrics(
      [subscription(), subscription({ item: { productId: "prod_other" } })],
      PRODUCT,
      NOW,
    );
    expect(metrics.activeSubscribers).toBe(1);
  });

  it("counts active, trialing, and past_due as active; canceled as not", () => {
    const metrics = computeStripeSubscriptionMetrics(
      [
        subscription({ status: "active" }),
        subscription({ status: "trialing" }),
        subscription({ status: "past_due" }),
        subscription({
          status: "canceled",
          canceledAt: NOW_S - 5 * DAY_S,
        }),
      ],
      PRODUCT,
      NOW,
    );
    expect(metrics.activeSubscribers).toBe(3);
    expect(metrics.churnedLast30).toBe(1);
  });

  it("normalizes MRR across billing intervals", () => {
    const metrics = computeStripeSubscriptionMetrics(
      [
        // $9/month
        subscription(),
        // $120/year → $10/month
        subscription({
          item: { unitAmount: 12000, interval: "year" },
        }),
      ],
      PRODUCT,
      NOW,
    );
    expect(metrics.mrr).toEqual({ amount: 1900, currency: "usd" });
  });

  it("windows new and churned subscriptions", () => {
    const metrics = computeStripeSubscriptionMetrics(
      [
        subscription({ created: NOW_S - 10 * DAY_S }),
        subscription({ created: NOW_S - 45 * DAY_S }),
        subscription({
          status: "canceled",
          canceledAt: NOW_S - 40 * DAY_S,
        }),
      ],
      PRODUCT,
      NOW,
    );
    expect(metrics.newLast30).toBe(1);
    expect(metrics.newPrev30).toBe(1);
    expect(metrics.churnedLast30).toBe(0);
    expect(metrics.churnedPrev30).toBe(1);
  });

  it("returns null MRR when no active item has a price", () => {
    const metrics = computeStripeSubscriptionMetrics(
      [subscription({ item: { unitAmount: null } })],
      PRODUCT,
      NOW,
    );
    expect(metrics.mrr).toBeNull();
  });
});

const ONE_OFF = "prod_oneoff";

function purchase(
  overrides: Partial<StripeOneOffPurchase> = {},
): StripeOneOffPurchase {
  return {
    id: crypto.randomUUID(),
    created: NOW_S - 5 * DAY_S,
    amountTotal: 4900,
    currency: "usd",
    paymentIntent: `pi_${crypto.randomUUID()}`,
    productIds: [ONE_OFF],
    ...overrides,
  };
}

function refund(overrides: Partial<StripeRefund> = {}): StripeRefund {
  return {
    id: crypto.randomUUID(),
    created: NOW_S - 3 * DAY_S,
    amount: 900,
    currency: "usd",
    paymentIntent: "pi_known",
    status: "succeeded",
    ...overrides,
  };
}

describe("computeStripeOneOffMetrics", () => {
  it("counts and sums purchases in both windows, scoped to the product", () => {
    const metrics = computeStripeOneOffMetrics(
      [
        purchase(),
        purchase({ created: NOW_S - 45 * DAY_S, amountTotal: 2900 }),
        purchase({ productIds: ["prod_other"] }),
      ],
      ONE_OFF,
      NOW,
    );
    expect(metrics.purchasesLast30).toBe(1);
    expect(metrics.revenueLast30).toBe(4900);
    expect(metrics.purchasesPrev30).toBe(1);
    expect(metrics.revenuePrev30).toBe(2900);
    expect(metrics.currency).toBe("usd");
  });

  it("handles no matching purchases", () => {
    const metrics = computeStripeOneOffMetrics([], ONE_OFF, NOW);
    expect(metrics.purchasesLast30).toBe(0);
    expect(metrics.revenueLast30).toBe(0);
    expect(metrics.currency).toBeNull();
  });
});

describe("computeStripeRefundMetrics", () => {
  it("windows refund counts and amounts", () => {
    const metrics = computeStripeRefundMetrics(
      [refund(), refund({ created: NOW_S - 45 * DAY_S, amount: 500 })],
      NOW,
    );
    expect(metrics.refundsLast30).toBe(1);
    expect(metrics.refundAmountLast30).toBe(900);
    expect(metrics.refundsPrev30).toBe(1);
    expect(metrics.refundAmountPrev30).toBe(500);
  });
});

describe("attributeRefundsToProduct", () => {
  it("matches via fetched sessions and falls back to per-refund lookup", async () => {
    const purchases = [purchase({ paymentIntent: "pi_known" })];
    const oldPurchase = purchase({
      paymentIntent: "pi_old",
      created: NOW_S - 90 * DAY_S,
    });
    const lookup = vi.fn(async (paymentIntent: string) =>
      paymentIntent === "pi_old" ? oldPurchase : null,
    );
    const matched = await attributeRefundsToProduct(
      [
        refund({ paymentIntent: "pi_known" }),
        // Purchase predates the sessions window → resolved via lookup.
        refund({ paymentIntent: "pi_old" }),
        // Lookup finds nothing → dropped.
        refund({ paymentIntent: "pi_unknown" }),
        // No PaymentIntent at all → dropped.
        refund({ paymentIntent: null }),
      ],
      purchases,
      ONE_OFF,
      lookup,
    );
    expect(matched).toHaveLength(2);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("drops refunds whose purchase belongs to another product", async () => {
    const matched = await attributeRefundsToProduct(
      [refund({ paymentIntent: "pi_other" })],
      [purchase({ paymentIntent: "pi_other", productIds: ["prod_other"] })],
      ONE_OFF,
      vi.fn(async () =>
        purchase({ paymentIntent: "pi_other", productIds: ["prod_other"] }),
      ),
    );
    expect(matched).toHaveLength(0);
  });
});
