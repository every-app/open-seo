import { AUTUMN_SEO_DATA_TOP_UP_PLAN_ID } from "@/shared/billing";

// Leaf module (no cloudflare:workers import) so the mapping is unit-testable.

export type AutumnInvoice = {
  planIds: Array<string>;
  stripeId: string;
  processorType: string;
  status: string;
  total: number;
  currency: string;
  createdAt: number;
};

// The largest legitimate invoice today is the $10/mo plan plus a $99 top-up;
// anything near this cap means the dollars-vs-cents assumption below broke.
const MAX_PLAUSIBLE_INVOICE_TOTAL_USD = 1000;

/** Maps a paid Autumn invoice to a Dub /track/sale body, or null when the
 *  invoice shouldn't be tracked. Autumn's `total` is in major units (dollars);
 *  Dub wants minor units. Prices are USD-only, so skip anything else rather
 *  than carrying a per-currency minor-unit table.
 *
 *  Refunds are not clawed back automatically: Autumn keeps a refunded
 *  invoice's status as "paid" and this response doesn't expose refund
 *  amounts, so refunded referral commissions must be adjusted manually in
 *  the Dub dashboard. */
export function buildDubSaleRequest(
  invoice: AutumnInvoice,
  organizationId: string,
) {
  if (invoice.status !== "paid" || invoice.total <= 0) return null;
  if (invoice.currency.toLowerCase() !== "usd") {
    console.warn("Skipping non-USD invoice for Dub sale tracking", {
      organizationId,
      currency: invoice.currency,
    });
    return null;
  }
  if (invoice.total > MAX_PLAUSIBLE_INVOICE_TOTAL_USD) {
    console.error("Skipping implausibly large invoice for Dub sale tracking", {
      organizationId,
      total: invoice.total,
    });
    return null;
  }

  return {
    invoiceId:
      invoice.stripeId ||
      `${organizationId}:${invoice.createdAt}:${invoice.total}`,
    amount: Math.round(invoice.total * 100),
    currency: "usd",
    eventName: "Invoice paid",
    paymentProcessor:
      invoice.processorType === "stripe" ||
      invoice.processorType === "revenuecat"
        ? invoice.processorType
        : "custom",
    metadata: {
      type: invoice.planIds.includes(AUTUMN_SEO_DATA_TOP_UP_PLAN_ID)
        ? "top_up"
        : "subscription",
    },
  };
}
