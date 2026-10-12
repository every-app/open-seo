import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BillingUsageChart } from "./BillingUsageChart";

const DAY_MS = 24 * 60 * 60 * 1000;

vi.mock("@/client/features/billing/useBillingUsageEvents", () => ({
  BILLING_USAGE_DAYS: 30,
  useBillingUsageEvents: () => ({
    isPending: false,
    isError: false,
    data: [
      { timestamp: Date.now(), value: 20, properties: {} },
      // Older than the first bar: cached events after local midnight.
      {
        timestamp: Date.now() - 31 * DAY_MS - 60_000,
        value: 30,
        properties: {},
      },
    ],
  }),
}));

describe("BillingUsageChart", () => {
  it("counts every fetched event in the total, as the breakdown does", () => {
    const markup = renderToStaticMarkup(createElement(BillingUsageChart));

    expect(markup).toContain("$0.05");
  });
});
