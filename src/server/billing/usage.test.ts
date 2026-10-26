import { beforeEach, describe, expect, it, vi } from "vitest";

const { aggregateMock } = vi.hoisted(() => ({ aggregateMock: vi.fn() }));

vi.mock("@/server/billing/autumn", () => ({
  autumn: { events: { aggregate: aggregateMock } },
}));

import { getOrganizationBillingUsage } from "./usage";

beforeEach(() => {
  aggregateMock.mockImplementation(async ({ groupBy }) =>
    groupBy === "properties.creditFeature"
      ? {
          list: [
            {
              period: 1,
              values: {},
              groupedValues: {
                usage_credits: { site_audit: 250, retired: 50, backlinks: -10 },
                topup_credits: { site_audit: 100 },
              },
            },
          ],
          total: {
            usage_credits: { count: 4, sum: 300 },
            topup_credits: { count: 2, sum: 200 },
          },
        }
      : {
          list: [
            { period: 1, values: { usage_credits: 300, topup_credits: 200 } },
            { period: 2, values: { usage_credits: 0, topup_credits: 0 } },
          ],
          total: {},
        },
  );
});

describe("getOrganizationBillingUsage", () => {
  it("totals both balances by day, and counts ungrouped events as Other", async () => {
    await expect(
      getOrganizationBillingUsage("org_1", "America/New_York"),
    ).resolves.toEqual({
      days: [
        { date: 1, usd: 0.5 },
        { date: 2, usd: 0 },
      ],
      // Other: 110 credits Autumn left ungrouped plus 50 of an unknown
      // feature. Backlinks nets below zero after a refund and is hidden.
      features: [
        { label: "Site Audit", usd: 0.35 },
        { label: "Other", usd: 0.16 },
      ],
    });
  });
});
