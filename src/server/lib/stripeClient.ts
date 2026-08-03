import { z } from "zod";

import {
  getOptionalEnvValue,
  getRequiredEnvValue,
} from "@/server/lib/runtime-env";

const STRIPE_API_BASE = "https://api.stripe.com";

// List endpoints page at 100; five pages bounds the work while comfortably
// covering a personal product's subscriber base.
const PAGE_LIMIT = 100;
const MAX_PAGES = 5;

/** A Stripe API call returned a non-2xx status. 401/403 mean the key was
 *  revoked or lacks read access — surfaced as a reconnect prompt, like
 *  Vercel's expected failures. */
export class StripeApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "StripeApiError";
  }
}

export function isExpectedStripeFailure(error: unknown): boolean {
  return (
    error instanceof StripeApiError &&
    (error.status === 401 || error.status === 403)
  );
}

/** Whether the instance-level STRIPE_SECRET_KEY secret is configured. Drives
 *  the setup-card-vs-picker UI; mirrors hasVercelToken. */
export async function hasStripeKey(): Promise<boolean> {
  return Boolean(await getOptionalEnvValue("STRIPE_SECRET_KEY"));
}

export type StripeProduct = { id: string; name: string; active: boolean };

/** One subscription flattened to the fields the revenue metrics need. Times
 *  are epoch seconds, amounts are minor currency units — both as Stripe
 *  reports them. */
export type StripeSubscription = {
  id: string;
  status: string;
  created: number;
  canceledAt: number | null;
  items: Array<{
    productId: string;
    unitAmount: number | null;
    currency: string;
    interval: string | null;
    intervalCount: number;
    quantity: number;
  }>;
};

/** One paid, one-off Checkout Session with its purchased products. */
export type StripeOneOffPurchase = {
  id: string;
  created: number;
  amountTotal: number | null;
  currency: string | null;
  /** The session's PaymentIntent id — the join key for refunds. */
  paymentIntent: string | null;
  productIds: string[];
};

/** One succeeded refund. Refunds reference a PaymentIntent, not a product —
 *  product attribution goes through the Checkout Session's paymentIntent. */
export type StripeRefund = {
  id: string;
  created: number;
  amount: number;
  currency: string | null;
  paymentIntent: string | null;
  status: string | null;
};

const listResponseSchema = z.looseObject({
  data: z.array(z.record(z.string(), z.unknown())),
  has_more: z.boolean().optional(),
});

const productSchema = z.looseObject({
  id: z.string(),
  name: z.string(),
  active: z.boolean(),
});

const subscriptionSchema = z.looseObject({
  id: z.string(),
  status: z.string(),
  created: z.number(),
  canceled_at: z.number().nullish(),
  items: z.looseObject({
    data: z.array(
      z.looseObject({
        quantity: z.number().nullish(),
        price: z.looseObject({
          product: z.string(),
          unit_amount: z.number().nullish(),
          currency: z.string(),
          recurring: z
            .looseObject({
              interval: z.string().nullish(),
              interval_count: z.number().nullish(),
            })
            .nullish(),
        }),
      }),
    ),
  }),
});

const checkoutSessionSchema = z.looseObject({
  id: z.string(),
  created: z.number(),
  mode: z.string().nullish(),
  payment_status: z.string().nullish(),
  amount_total: z.number().nullish(),
  currency: z.string().nullish(),
  payment_intent: z.string().nullish(),
  line_items: z
    .looseObject({
      data: z.array(
        z.looseObject({
          price: z.looseObject({ product: z.string() }).nullish(),
        }),
      ),
    })
    .nullish(),
});

const refundSchema = z.looseObject({
  id: z.string(),
  created: z.number(),
  amount: z.number(),
  currency: z.string().nullish(),
  payment_intent: z.string().nullish(),
  status: z.string().nullish(),
});

/** Paid one-off sessions from raw session rows; non-payment or unpaid
 *  sessions drop out. */
function toOneOffPurchases(
  rows: Array<Record<string, unknown>>,
): StripeOneOffPurchase[] {
  return rows
    .map((row) => checkoutSessionSchema.parse(row))
    .filter(
      (session) =>
        session.mode === "payment" && session.payment_status === "paid",
    )
    .map((session) => ({
      id: session.id,
      created: session.created,
      amountTotal: session.amount_total ?? null,
      currency: session.currency ?? null,
      paymentIntent: session.payment_intent ?? null,
      productIds: (session.line_items?.data ?? [])
        .map((item) => item.price?.product)
        .filter((product): product is string => Boolean(product)),
    }));
}

function messageForStatus(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return "Stripe rejected the API key (revoked, or missing read access). Update STRIPE_SECRET_KEY to continue.";
  }
  if (status === 429) {
    return "Stripe API rate limit reached. Retry shortly.";
  }
  return `Stripe API error (${status}): ${body.slice(0, 300)}`;
}

// Pinned API version. Newer Stripe accounts have no account-default version
// and reject requests without this header ("You did not provide an API
// version"); older accounts just get this version explicitly. Verified live
// 2026-08-03. Bump deliberately — response shapes are parsed loosely, but
// field semantics can change between versions.
const STRIPE_API_VERSION = "2026-07-29.dahlia";

/**
 * @param stripeAccountId Target account ("acct_…"), sent as Stripe-Context.
 *   Required when STRIPE_SECRET_KEY is an organization-level key — org keys
 *   reject requests that don't name an account — and per-connection so
 *   different projects can point at different accounts. Null/undefined for
 *   account-level keys.
 */
export function createStripeClient(stripeAccountId?: string | null) {
  async function request(path: string): Promise<unknown> {
    const key = await getRequiredEnvValue("STRIPE_SECRET_KEY");
    const response = await fetch(`${STRIPE_API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        "Stripe-Version": STRIPE_API_VERSION,
        ...(stripeAccountId ? { "Stripe-Context": stripeAccountId } : {}),
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new StripeApiError(
        response.status,
        messageForStatus(response.status, body),
        body,
      );
    }
    return response.json();
  }

  /** Follow starting_after cursors until has_more is false or MAX_PAGES. */
  async function listAll(
    path: string,
    params: URLSearchParams,
  ): Promise<Array<Record<string, unknown>>> {
    const rows: Array<Record<string, unknown>> = [];
    let startingAfter: string | null = null;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams(params);
      query.set("limit", String(PAGE_LIMIT));
      if (startingAfter) query.set("starting_after", startingAfter);
      const raw = await request(`${path}?${query}`);
      const parsed = listResponseSchema.parse(raw);
      rows.push(...parsed.data);
      const last = parsed.data.at(-1);
      const lastId = last
        ? z.looseObject({ id: z.string() }).parse(last).id
        : null;
      if (!parsed.has_more || !lastId) break;
      startingAfter = lastId;
    }
    return rows;
  }

  return {
    /** All products — archived ones included, because a retired one-off
     *  product's purchase history is still worth tracking. */
    async listProducts(): Promise<StripeProduct[]> {
      const rows = await listAll("/v1/products", new URLSearchParams());
      return rows.map((row) => {
        const product = productSchema.parse(row);
        return {
          id: product.id,
          name: product.name,
          active: product.active,
        };
      });
    },

    /** Every subscription regardless of status — the metrics need canceled
     *  ones for churn. The list endpoint has no product filter, so product
     *  scoping happens in the service from items[].productId. */
    async listSubscriptions(): Promise<StripeSubscription[]> {
      const params = new URLSearchParams({ status: "all" });
      const rows = await listAll("/v1/subscriptions", params);
      return rows.map((row) => {
        const sub = subscriptionSchema.parse(row);
        return {
          id: sub.id,
          status: sub.status,
          created: sub.created,
          canceledAt: sub.canceled_at ?? null,
          items: sub.items.data.map((item) => ({
            productId: item.price.product,
            unitAmount: item.price.unit_amount ?? null,
            currency: item.price.currency,
            interval: item.price.recurring?.interval ?? null,
            intervalCount: item.price.recurring?.interval_count ?? 1,
            quantity: item.quantity ?? 1,
          })),
        };
      });
    },

    /** Paid one-off (mode=payment) Checkout Sessions created since
     *  `createdGte` (epoch seconds), with their line-item products. */
    async listOneOffPurchases(
      createdGte: number,
    ): Promise<StripeOneOffPurchase[]> {
      const params = new URLSearchParams({
        "created[gte]": String(createdGte),
        "expand[]": "data.line_items",
      });
      const rows = await listAll("/v1/checkout/sessions", params);
      return toOneOffPurchases(rows);
    },

    /** The paid one-off session behind one PaymentIntent, or null. Used to
     *  attribute a refund whose purchase predates the sessions window. */
    async getOneOffPurchaseByPaymentIntent(
      paymentIntent: string,
    ): Promise<StripeOneOffPurchase | null> {
      const params = new URLSearchParams({
        payment_intent: paymentIntent,
        "expand[]": "data.line_items",
        limit: "1",
      });
      const raw = await request(`/v1/checkout/sessions?${params}`);
      return toOneOffPurchases(listResponseSchema.parse(raw).data)[0] ?? null;
    },

    /** Refunds created since `createdGte` (epoch seconds), any status. */
    async listRefunds(createdGte: number): Promise<StripeRefund[]> {
      const params = new URLSearchParams({
        "created[gte]": String(createdGte),
      });
      const rows = await listAll("/v1/refunds", params);
      return rows.map((row) => {
        const refund = refundSchema.parse(row);
        return {
          id: refund.id,
          created: refund.created,
          amount: refund.amount,
          currency: refund.currency ?? null,
          paymentIntent: refund.payment_intent ?? null,
          status: refund.status ?? null,
        };
      });
    },
  };
}
