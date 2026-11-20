import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import type { GscPerformanceInput } from "@/server/features/gsc/searchAnalytics";
import {
  exportSearchPerformanceTable,
  getSearchPerformanceDetail,
  getSearchPerformanceReport,
  getSearchPerformanceTable,
} from "./searchPerformance";

const { getPerformance } = vi.hoisted(() => ({
  getPerformance:
    vi.fn<(input: GscPerformanceInput) => Promise<{ rows: unknown[] }>>(),
}));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: { getPerformance },
  GscNotConnectedError: class extends Error {},
  isExpectedGrantFailure: () => false,
}));
vi.mock("@/serverFunctions/middleware", () => ({ requireProjectContext: [] }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      validator: (schema: z.ZodType) => ({
        handler:
          (
            handler: (input: {
              data: unknown;
              context: { projectId: string };
            }) => unknown,
          ) =>
          ({ data }: { data: unknown }) =>
            handler({
              data: schema.parse(data),
              context: { projectId: "authorized-project" },
            }),
      }),
    }),
  }),
}));

const data = {
  projectId: "authorized-project",
  dateRange: "last_28_days" as const,
  country: "SWE",
  device: "MOBILE" as const,
  pageFilter: { operator: "contains" as const, expression: "/collections/" },
  queryFilter: { operator: "equals" as const, expression: "OpenSEO" },
};
const sentFilters = (call: number) =>
  getPerformance.mock.calls[call][0].filters;
const filters = [
  { dimension: "device", operator: "equals", expression: "MOBILE" },
  { dimension: "page", ...data.pageFilter },
  { dimension: "query", ...data.queryFilter },
  { dimension: "country", operator: "equals", expression: "swe" },
];

describe("Search Performance combined filters", () => {
  beforeEach(() => getPerformance.mockResolvedValue({ rows: [] }));

  it("applies the same filters to both totals periods and striking distance, keeping country options available", async () => {
    await getSearchPerformanceReport({ data });
    expect(getPerformance).toHaveBeenCalledTimes(4);
    for (const index of [0, 1, 2]) {
      expect(getPerformance.mock.calls[index][0]).toMatchObject({
        projectId: "authorized-project",
        filters,
      });
    }
    expect(getPerformance.mock.calls[3][0]).toMatchObject({
      dimensions: ["country"],
      filters: filters.slice(0, 3),
    });
  });

  it("reads Discover without queries: no striking-distance scan, query filter, or device filter", async () => {
    await getSearchPerformanceReport({
      data: { ...data, searchType: "discover" },
    });

    expect(getPerformance).toHaveBeenCalledTimes(3);
    // Totals for both periods, then the country list; Google rejects a device
    // filter on Discover and it has no queries, so both are dropped everywhere.
    const discoverFilters = [filters[1], filters[3]];
    for (const index of [0, 1]) {
      expect(getPerformance.mock.calls[index][0]).toMatchObject({
        type: "discover",
        dimensions: ["date"],
        filters: discoverFilters,
      });
    }
    expect(getPerformance.mock.calls[2][0]).toMatchObject({
      type: "discover",
      dimensions: ["country"],
      filters: discoverFilters.slice(0, 1),
    });
  });

  it.each(["query", "page"] as const)(
    "keeps %s pagination and exports on the same filtered dataset",
    async (dimension) => {
      await getSearchPerformanceTable({
        data: { ...data, dimension, page: 2, pageSize: 25 },
      });
      await exportSearchPerformanceTable({ data: { ...data, dimension } });
      expect(getPerformance.mock.calls[0][0]).toMatchObject({
        dimensions: [dimension],
        filters,
        startRow: 25,
        rowLimit: 26,
      });
      // The previous period, which each row's change in clicks is read from.
      expect(getPerformance.mock.calls[1][0]).toMatchObject({
        dimensions: [dimension],
        filters,
      });
      expect(getPerformance.mock.calls[2][0]).toMatchObject({
        dimensions: [dimension],
        filters,
        rowLimit: 1000,
      });
    },
  );

  it("opens one page under the other filters, with its URL in place of the page text filter", async () => {
    const key = "https://example.com/collections/mugs";
    await getSearchPerformanceDetail({
      data: { ...data, dimension: "page", key },
    });
    // Both periods' daily rows, then the queries the page ranks for.
    expect(getPerformance).toHaveBeenCalledTimes(3);
    for (const index of [0, 1, 2]) {
      expect(getPerformance.mock.calls[index][0]).toMatchObject({
        filters: [
          filters[0],
          { dimension: "page", operator: "equals", expression: key },
          filters[2],
          filters[3],
        ],
      });
    }
    expect(getPerformance.mock.calls[2][0]).toMatchObject({
      dimensions: ["query"],
    });
  });

  it("filters by brand, but never alongside a query filter", async () => {
    const branded = {
      ...data,
      queryFilter: undefined,
      brand: "BRANDED" as const,
    };
    const brandFilter = {
      dimension: "brandedClassification",
      operator: "equals",
      expression: "BRANDED",
    };
    await getSearchPerformanceReport({ data: branded });
    // Totals for both periods and striking distance are branded; the split
    // itself covers both sides.
    for (const index of [0, 1, 2]) {
      expect(sentFilters(index)).toContainEqual(brandFilter);
    }
    expect(getPerformance.mock.calls[4][0]).toMatchObject({
      dimensions: ["brandedClassification"],
      filters: [filters[0], filters[1], filters[3]],
    });

    const reportCalls = getPerformance.mock.calls.length;
    await getSearchPerformanceDetail({
      data: { ...branded, dimension: "query", key: "openseo" },
    });
    expect(getPerformance).toHaveBeenCalledTimes(reportCalls + 3);
    for (
      let index = reportCalls;
      index < getPerformance.mock.calls.length;
      index++
    ) {
      expect(sentFilters(index)).not.toContainEqual(brandFilter);
    }
  });

  it("reports the last-page row count instead of a full page for narrow filters", async () => {
    getPerformance.mockResolvedValue({
      rows: [
        {
          keys: ["soundsplitter"],
          clicks: 1,
          impressions: 1,
          ctr: 1,
          position: 6,
        },
      ],
    });
    const result = await getSearchPerformanceTable({
      data: { ...data, dimension: "query", page: 1, pageSize: 25 },
    });
    expect(result).toMatchObject({
      connected: true,
      hasNextPage: false,
      totalCount: 1,
    });
    getPerformance.mockResolvedValue({ rows: [] });
    const empty = await getSearchPerformanceTable({
      data: { ...data, dimension: "query", page: 1, pageSize: 25 },
    });
    expect(empty).toMatchObject({
      connected: true,
      hasNextPage: false,
      totalCount: 0,
    });
  });
});
