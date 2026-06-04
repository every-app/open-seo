import type { GscSearchAnalyticsRequest } from "@/server/lib/gscClient";

// Shared option sets — also drive the MCP tool Zod schemas so the two stay in sync.
export const GSC_DIMENSIONS = [
  "query",
  "page",
  "country",
  "device",
  "date",
  "searchAppearance",
] as const;
export const GSC_FILTER_OPERATORS = [
  "equals",
  "notEquals",
  "contains",
  "notContains",
] as const;
export const GSC_SEARCH_TYPES = [
  "web",
  "image",
  "video",
  "news",
  "googleNews",
  "discover",
] as const;
export const GSC_DATE_RANGES = [
  "last_7_days",
  "last_28_days",
  "last_3_months",
  "last_6_months",
  "last_12_months",
  "last_16_months",
] as const;

export const GSC_DEFAULT_ROW_LIMIT = 1000;
// v1 caps rows-per-call at 1000 to protect the MCP context window. The GSC API
// supports up to 25000, but we keep fetched == returned so counts stay honest;
// the agent paginates with `startRow` for more.
export const GSC_MAX_ROW_LIMIT = 1000;
// GSC data trails by ~2-3 days; default the end of convenience ranges before it.
const GSC_DATA_LAG_DAYS = 3;

export type GscDimension = (typeof GSC_DIMENSIONS)[number];
type GscFilterOperator = (typeof GSC_FILTER_OPERATORS)[number];
export type GscSearchType = (typeof GSC_SEARCH_TYPES)[number];
export type GscDateRange = (typeof GSC_DATE_RANGES)[number];

export type GscPerformanceFilter = {
  dimension: GscDimension;
  operator: GscFilterOperator;
  expression: string;
};

export type GscPerformanceInput = {
  projectId: string;
  dimensions?: GscDimension[];
  dateRange?: GscDateRange;
  startDate?: string;
  endDate?: string;
  filters?: GscPerformanceFilter[];
  rowLimit?: number;
  startRow?: number;
  type?: GscSearchType;
  dataState?: "all" | "final";
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function subtractRange(end: Date, range: GscDateRange): Date {
  const d = new Date(end);
  switch (range) {
    case "last_7_days":
      d.setUTCDate(d.getUTCDate() - 7);
      break;
    case "last_28_days":
      d.setUTCDate(d.getUTCDate() - 28);
      break;
    case "last_3_months":
      d.setUTCMonth(d.getUTCMonth() - 3);
      break;
    case "last_6_months":
      d.setUTCMonth(d.getUTCMonth() - 6);
      break;
    case "last_12_months":
      d.setUTCMonth(d.getUTCMonth() - 12);
      break;
    case "last_16_months":
      d.setUTCMonth(d.getUTCMonth() - 16);
      break;
  }
  return d;
}

function sixteenMonthFloor(today: Date): string {
  const d = new Date(today);
  d.setUTCMonth(d.getUTCMonth() - 16);
  return formatDate(d);
}

/** Resolve a convenience `dateRange` or explicit start/end into GSC dates.
 *  `today` is injectable for deterministic tests. */
export function resolveDateRange(
  input: Pick<GscPerformanceInput, "dateRange" | "startDate" | "endDate">,
  today: Date = new Date(),
): { startDate: string; endDate: string } {
  const floor = sixteenMonthFloor(today);

  if (input.startDate && input.endDate) {
    // Clamp the start to GSC's 16-month lower bound.
    const startDate = input.startDate < floor ? floor : input.startDate;
    return { startDate, endDate: input.endDate };
  }

  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() - GSC_DATA_LAG_DAYS);
  const start = subtractRange(end, input.dateRange ?? "last_28_days");
  const startDate = formatDate(start);
  return {
    startDate: startDate < floor ? floor : startDate,
    endDate: formatDate(end),
  };
}

/** Build the GSC `searchAnalytics.query` body from validated tool input.
 *  Critically, flat `filters` are wrapped into `dimensionFilterGroups` — GSC
 *  silently ignores a top-level `filters` field. */
export function buildSearchAnalyticsRequest(
  input: GscPerformanceInput,
  today: Date = new Date(),
): GscSearchAnalyticsRequest {
  const { startDate, endDate } = resolveDateRange(input, today);
  const request: GscSearchAnalyticsRequest = {
    startDate,
    endDate,
    dimensions:
      input.dimensions && input.dimensions.length > 0
        ? input.dimensions
        : ["query"],
    rowLimit: clamp(
      input.rowLimit ?? GSC_DEFAULT_ROW_LIMIT,
      1,
      GSC_MAX_ROW_LIMIT,
    ),
    type: input.type ?? "web",
    dataState: input.dataState ?? "all",
  };
  if (input.startRow && input.startRow > 0) {
    request.startRow = input.startRow;
  }
  if (input.filters && input.filters.length > 0) {
    request.dimensionFilterGroups = [
      { groupType: "and", filters: input.filters },
    ];
  }
  return request;
}
