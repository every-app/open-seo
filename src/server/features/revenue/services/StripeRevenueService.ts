import { AppError } from "@/server/lib/errors";
import {
  createStripeClient,
  type StripeOneOffPurchase,
  type StripeSubscription,
} from "@/server/lib/stripeClient";
import {
  StripeConnectionRepository,
  type StripeConnection,
} from "@/server/features/revenue/repositories/StripeConnectionRepository";

/** Thrown when a project has no Stripe product mapping. */
export class StripeNotConnectedError extends Error {
  constructor(public readonly projectId: string) {
    super("Stripe is not connected for this project");
    this.name = "StripeNotConnectedError";
  }
}

const WINDOW_DAYS = 30;
const DAY_S = 24 * 60 * 60;

// Statuses that count as a current subscriber. past_due is included: the
// customer hasn't churned, their payment is retrying.
const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

// Months per billing interval, for normalizing plan prices to MRR.
const MONTHS_PER_INTERVAL: Record<string, number> = {
  day: 1 / 30.44,
  week: 1 / 4.345,
  month: 1,
  year: 12,
};

export type StripeSubscriptionMetrics = {
  activeSubscribers: number;
  newLast30: number;
  newPrev30: number;
  churnedLast30: number;
  churnedPrev30: number;
  /** Monthly recurring revenue in minor currency units, normalized across
   *  billing intervals; null when no active subscription has a priced item. */
  mrr: { amount: number; currency: string } | null;
};

export type StripeOneOffMetrics = {
  purchasesLast30: number;
  purchasesPrev30: number;
  /** Sums of Checkout Session amount_total in minor currency units. */
  revenueLast30: number;
  revenuePrev30: number;
  currency: string | null;
};

function matchesProduct(sub: StripeSubscription, productId: string): boolean {
  return sub.items.some((item) => item.productId === productId);
}

function inWindow(time: number | null, from: number, to: number): boolean {
  return time !== null && time >= from && time < to;
}

function sumAmounts(rows: StripeOneOffPurchase[]): number {
  return rows.reduce((total, row) => total + (row.amountTotal ?? 0), 0);
}

/** Pure metric computation over the full subscription list, scoped to one
 *  product — exported for tests. Windows are the last 30 days and the 30
 *  days before that. */
export function computeStripeSubscriptionMetrics(
  subscriptions: StripeSubscription[],
  productId: string,
  now: Date,
): StripeSubscriptionMetrics {
  const until = Math.floor(now.getTime() / 1000) + DAY_S; // include today
  const since = until - WINDOW_DAYS * DAY_S;
  const prevSince = since - WINDOW_DAYS * DAY_S;
  const scoped = subscriptions.filter((sub) => matchesProduct(sub, productId));
  const active = scoped.filter((sub) => ACTIVE_STATUSES.has(sub.status));

  let mrrAmount = 0;
  let mrrCurrency: string | null = null;
  for (const sub of active) {
    for (const item of sub.items) {
      if (item.productId !== productId) continue;
      if (item.unitAmount === null || !item.interval) continue;
      const months = MONTHS_PER_INTERVAL[item.interval];
      if (!months) continue;
      mrrAmount +=
        (item.unitAmount * item.quantity) / (months * item.intervalCount);
      mrrCurrency ??= item.currency;
    }
  }

  return {
    activeSubscribers: active.length,
    newLast30: scoped.filter((sub) => inWindow(sub.created, since, until))
      .length,
    newPrev30: scoped.filter((sub) => inWindow(sub.created, prevSince, since))
      .length,
    churnedLast30: scoped.filter((sub) =>
      inWindow(sub.canceledAt, since, until),
    ).length,
    churnedPrev30: scoped.filter((sub) =>
      inWindow(sub.canceledAt, prevSince, since),
    ).length,
    mrr: mrrCurrency
      ? { amount: Math.round(mrrAmount), currency: mrrCurrency }
      : null,
  };
}

/** Pure one-off purchase metrics scoped to one product — exported for tests.
 *  Revenue uses the session's amount_total, so a multi-product cart counts
 *  in full toward the matched product. */
export function computeStripeOneOffMetrics(
  purchases: StripeOneOffPurchase[],
  productId: string,
  now: Date,
): StripeOneOffMetrics {
  const until = Math.floor(now.getTime() / 1000) + DAY_S; // include today
  const since = until - WINDOW_DAYS * DAY_S;
  const prevSince = since - WINDOW_DAYS * DAY_S;
  const scoped = purchases.filter((purchase) =>
    purchase.productIds.includes(productId),
  );
  const within = (from: number, to: number) =>
    scoped.filter(
      (purchase) => purchase.created >= from && purchase.created < to,
    );
  const last30 = within(since, until);
  const prev30 = within(prevSince, since);
  return {
    purchasesLast30: last30.length,
    purchasesPrev30: prev30.length,
    revenueLast30: sumAmounts(last30),
    revenuePrev30: sumAmounts(prev30),
    currency: scoped.find((row) => row.currency)?.currency ?? null,
  };
}

async function getConnection(
  projectId: string,
): Promise<StripeConnection | null> {
  return StripeConnectionRepository.getByProjectId(projectId);
}

/** Active Stripe products, flagged with the project's current selections. */
async function listProductsForPicker(projectId: string) {
  const [connection, products] = await Promise.all([
    StripeConnectionRepository.getByProjectId(projectId),
    createStripeClient().listProducts(),
  ]);
  return products.map((product) => ({
    productId: product.id,
    name: product.name,
    isSubscriptionProduct: connection?.subscriptionProductId === product.id,
    isOneOffProduct: connection?.oneOffProductId === product.id,
  }));
}

/** Map Stripe products to an OpenSEO project. Ids are validated against the
 *  account's products so a typo can't create a dead connection. */
async function setProducts(input: {
  projectId: string;
  organizationId: string;
  subscriptionProductId: string | null;
  oneOffProductId: string | null;
  userId: string;
}): Promise<StripeConnection> {
  if (!input.subscriptionProductId && !input.oneOffProductId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Pick at least one product to track (subscription or one-off).",
    );
  }
  const products = await createStripeClient().listProducts();
  const findProduct = (id: string | null) => {
    if (!id) return null;
    const match = products.find((product) => product.id === id);
    if (!match) {
      throw new AppError(
        "NOT_FOUND",
        "That Stripe product isn't visible to this deployment's STRIPE_SECRET_KEY.",
      );
    }
    return match;
  };
  const subscriptionProduct = findProduct(input.subscriptionProductId);
  const oneOffProduct = findProduct(input.oneOffProductId);
  return StripeConnectionRepository.upsert({
    projectId: input.projectId,
    organizationId: input.organizationId,
    subscriptionProductId: subscriptionProduct?.id ?? null,
    subscriptionProductName: subscriptionProduct?.name ?? null,
    oneOffProductId: oneOffProduct?.id ?? null,
    oneOffProductName: oneOffProduct?.name ?? null,
    connectedByUserId: input.userId,
  });
}

async function disconnect(projectId: string): Promise<void> {
  await StripeConnectionRepository.deleteByProjectId(projectId);
}

/** The Stripe panel payload: subscriber metrics for the subscription product
 *  and purchase metrics for the one-off product, whichever are mapped. */
async function getRevenue(input: { projectId: string }) {
  const connection = await StripeConnectionRepository.getByProjectId(
    input.projectId,
  );
  if (!connection) {
    throw new StripeNotConnectedError(input.projectId);
  }
  const client = createStripeClient();
  const now = new Date();
  // Sessions need the prior window too, so fetch 60 days back.
  const createdGte = Math.floor(now.getTime() / 1000) - 2 * WINDOW_DAYS * DAY_S;
  const [subscriptions, purchases] = await Promise.all([
    connection.subscriptionProductId ? client.listSubscriptions() : null,
    connection.oneOffProductId ? client.listOneOffPurchases(createdGte) : null,
  ]);
  return {
    subscription:
      connection.subscriptionProductId && subscriptions
        ? {
            productId: connection.subscriptionProductId,
            productName: connection.subscriptionProductName,
            ...computeStripeSubscriptionMetrics(
              subscriptions,
              connection.subscriptionProductId,
              now,
            ),
          }
        : null,
    oneOff:
      connection.oneOffProductId && purchases
        ? {
            productId: connection.oneOffProductId,
            productName: connection.oneOffProductName,
            ...computeStripeOneOffMetrics(
              purchases,
              connection.oneOffProductId,
              now,
            ),
          }
        : null,
  };
}

export const StripeRevenueService = {
  getConnection,
  listProductsForPicker,
  setProducts,
  disconnect,
  getRevenue,
};
