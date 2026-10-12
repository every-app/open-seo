import { describe, expect, it, vi } from "vitest";
import { AUTUMN_SEO_DATA_TOP_UP_PLAN_ID } from "@/shared/billing";
import { type AutumnInvoice, buildDubSaleRequest } from "./dub-sale";

function invoice(overrides: Partial<AutumnInvoice> = {}): AutumnInvoice {
  return {
    planIds: ["base-plan"],
    stripeId: "in_123",
    processorType: "stripe",
    status: "paid",
    total: 10,
    currency: "USD",
    createdAt: 1756000000000,
    ...overrides,
  };
}

describe("buildDubSaleRequest", () => {
  it("converts Autumn's dollar total to cents and keys on the Stripe invoice id", () => {
    expect(buildDubSaleRequest(invoice(), "org_1")).toEqual({
      invoiceId: "in_123",
      amount: 1000,
      currency: "usd",
      eventName: "Invoice paid",
      paymentProcessor: "stripe",
      metadata: { type: "subscription" },
    });
  });

  it("labels top-up invoices via their plan id", () => {
    const sale = buildDubSaleRequest(
      invoice({ planIds: [AUTUMN_SEO_DATA_TOP_UP_PLAN_ID] }),
      "org_1",
    );
    expect(sale?.metadata).toEqual({ type: "top_up" });
  });

  it("rounds fractional dollar totals to whole cents", () => {
    expect(
      buildDubSaleRequest(invoice({ total: 19.99 }), "org_1")?.amount,
    ).toBe(1999);
  });

  it.each([
    ["unpaid", { status: "open" }],
    ["zero-total", { total: 0 }],
    ["non-USD", { currency: "eur" }],
    // A total this large signals cents were passed where dollars belong.
    ["implausibly large", { total: 1900 }],
  ])("skips %s invoices", (_label, overrides) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(buildDubSaleRequest(invoice(overrides), "org_1")).toBeNull();
  });

  it("falls back to a stable synthetic key when stripeId is missing", () => {
    const sale = buildDubSaleRequest(
      invoice({ stripeId: "", processorType: "revenuecat" }),
      "org_1",
    );
    expect(sale?.invoiceId).toBe("org_1:1756000000000:10");
    expect(sale?.paymentProcessor).toBe("revenuecat");
  });
});
