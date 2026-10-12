import { beforeEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";
import {
  exportSearchPerformanceTable,
  getSearchPerformanceReport,
  getSearchPerformanceTable,
} from "./searchPerformance";

const { getPerformance } = vi.hoisted(() => ({ getPerformance: vi.fn() }));
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
      expect(getPerformance.mock.calls[1][0]).toMatchObject({
        dimensions: [dimension],
        filters,
        rowLimit: 1000,
      });
    },
  );

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
