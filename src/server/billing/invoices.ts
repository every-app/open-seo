import { sort } from "remeda";
import { z } from "zod";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { autumn } from "@/server/billing/autumn";
import { AppError } from "@/server/lib/errors";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import { safeHttpUrl } from "@/shared/safe-url";

type BillingCaller = Pick<EnsuredUserContext, "organizationId" | "role">;

/** The newest invoices the billing page lists. Older ones stay in the Stripe
 *  billing portal. Each row costs one Stripe lookup, so keep this small. */
const INVOICE_PAGE_SIZE = 12;

type BillingInvoice = {
  id: string;
  /** Stripe's invoice number, as printed on the PDF. */
  number: string | null;
  createdAt: number;
  /** The billing period of the invoice's lines, in epoch ms. Null on one-off
   *  purchases such as top-ups. */
  periodStart: number | null;
  periodEnd: number | null;
  /** Major units (dollars), as Autumn reports them. */
  total: number;
  currency: string;
  status: string;
  pdfUrl: string | null;
};

// The Stripe invoice, as Autumn's `GET /v1/invoices/{id}/stripe` returns it.
// Only the fields the billing page shows.
const stripeInvoiceSchema = z.object({
  number: z.string().nullable(),
  invoice_pdf: z.string().nullable(),
});

export async function listOrganizationInvoices(caller: BillingCaller) {
  // Invoices show the billing address, so they follow the billing permission.
  requireOrgPermission(caller, { billing: ["manage"] });
  const { list, nextCursor } = await autumn.invoices.list({
    customerId: caller.organizationId,
    // Drafts have no number or PDF yet.
    status: ["open", "paid", "uncollectible", "void"],
    limit: INVOICE_PAGE_SIZE,
  });

  const rows = await Promise.all(
    list.map(async (invoice) => ({
      invoice,
      stripeInvoice: await getStripeInvoice(invoice.stripeId),
    })),
  );
  const invoices = rows.map(({ invoice, stripeInvoice }): BillingInvoice => {
    // A one-off line, such as a top-up, starts and ends at the purchase.
    const periods = (invoice.items ?? []).flatMap((item) =>
      item.periodStart !== null &&
      item.periodEnd !== null &&
      item.periodEnd > item.periodStart
        ? [{ start: item.periodStart, end: item.periodEnd }]
        : [],
    );
    return {
      id: invoice.stripeId,
      number: stripeInvoice.number,
      createdAt: invoice.createdAt,
      periodStart: periods.length
        ? Math.min(...periods.map((period) => period.start))
        : null,
      periodEnd: periods.length
        ? Math.max(...periods.map((period) => period.end))
        : null,
      total: invoice.total,
      currency: invoice.currency,
      status: invoice.status,
      pdfUrl: safeHttpUrl(stripeInvoice.invoice_pdf),
    };
  });

  return {
    invoices: sort(invoices, (a, b) => b.createdAt - a.createdAt),
    hasMore: nextCursor !== null,
  };
}

/** Stripe emails a receipt for each paid invoice to the billing email. Autumn
 *  stores the setting on the customer and triggers the email. */
export async function setOrganizationInvoiceEmails(
  caller: BillingCaller,
  enabled: boolean,
) {
  requireOrgPermission(caller, { billing: ["manage"] });
  await autumn.customers.update({
    customerId: caller.organizationId,
    sendEmailReceipts: enabled,
  });
}

// The SDK has no method for this endpoint. Callers pass only Stripe ids from
// the organization's own invoice list.
async function getStripeInvoice(stripeInvoiceId: string) {
  const secretKey = await getRequiredEnvValue("AUTUMN_SECRET_KEY");
  const response = await fetch(
    `https://api.useautumn.com/v1/invoices/${encodeURIComponent(stripeInvoiceId)}/stripe`,
    {
      headers: { Authorization: `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      `Autumn Stripe invoice lookup failed with status ${response.status}`,
    );
  }
  return stripeInvoiceSchema.parse(await response.json());
}
