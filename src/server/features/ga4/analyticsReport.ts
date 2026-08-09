import type {
  Ga4FilterExpression,
  Ga4RunReportRequest,
} from "@/server/lib/ga4Client";

// Curated option sets — also drive the MCP tool Zod schemas so the two stay in
// sync. GA4 exposes far more dimensions/metrics than this; these are the ones
// that answer this project's actual reporting questions (channel mix, top
// pages, growth over time) without overwhelming the tool surface.
export const GA4_DIMENSIONS = [
  "date",
  "sessionDefaultChannelGroup",
  "pagePath",
  "landingPage",
  "country",
  "deviceCategory",
  "sessionSource",
  "sessionMedium",
] as const;

export const GA4_METRICS = [
  "sessions",
  "totalUsers",
  "newUsers",
  "activeUsers",
  "screenPageViews",
  "engagementRate",
  "averageSessionDuration",
  "eventCount",
  "conversions",
  "bounceRate",
] as const;

export const GA4_FILTER_OPERATORS = [
  "equals",
  "notEquals",
  "contains",
  "notContains",
] as const;

export const GA4_DATE_RANGES = [
  "last_7_days",
  "last_28_days",
  "last_3_months",
  "last_6_months",
  "last_12_months",
  "last_16_months",
] as const;

export const GA4_DEFAULT_ROW_LIMIT = 1000;
// v1 caps rows-per-call at 1000, matching the Search Console tool's cap, to
// protect the MCP context window. The Data API supports far more; the agent
// paginates with `startRow` for more, same convention as GSC.
export const GA4_MAX_ROW_LIMIT = 1000;
// GA4's own processing lag: end the default window a day before "today" so
// the last row isn't a partial, still-accumulating day.
const GA4_DATA_LAG_DAYS = 1;

export type Ga4Dimension = (typeof GA4_DIMENSIONS)[number];
export type Ga4Metric = (typeof GA4_METRICS)[number];
type Ga4FilterOperator = (typeof GA4_FILTER_OPERATORS)[number];
export type Ga4DateRange = (typeof GA4_DATE_RANGES)[number];

export type Ga4PerformanceFilter = {
  dimension: Ga4Dimension;
  operator: Ga4FilterOperator;
  expression: string;
};

export type Ga4PerformanceInput = {
  projectId: string;
  dimensions?: Ga4Dimension[];
  metrics: Ga4Metric[];
  dateRange?: Ga4DateRange;
  startDate?: string;
  endDate?: string;
  filters?: Ga4PerformanceFilter[];
  rowLimit?: number;
  startRow?: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Subtract calendar months in UTC, clamping the day to the target month's
// length — matches the Search Console tool's date math (naive setUTCMonth
// rolls e.g. March 31 minus 1 month into March 3, not February 28).
function subtractUtcMonths(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const d = new Date(date);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const daysInTargetMonth = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, daysInTargetMonth));
  return d;
}

function subtractRange(end: Date, range: Ga4DateRange): Date {
  const d = new Date(end);
  switch (range) {
    case "last_7_days":
      d.setUTCDate(d.getUTCDate() - 7);
      return d;
    case "last_28_days":
      d.setUTCDate(d.getUTCDate() - 28);
      return d;
    case "last_3_months":
      return subtractUtcMonths(d, 3);
    case "last_6_months":
      return subtractUtcMonths(d, 6);
    case "last_12_months":
      return subtractUtcMonths(d, 12);
    case "last_16_months":
      return subtractUtcMonths(d, 16);
  }
}

/** Resolve a convenience `dateRange` or explicit start/end into GA4 dates.
 *  Unlike Search Console, GA4 has no fixed API-enforced lookback ceiling — how
 *  far back real data exists depends on the property's own configured
 *  data-retention setting, so there is no floor to clamp to here.
 *  `today` is injectable for deterministic tests. */
export function resolveDateRange(
  input: Pick<Ga4PerformanceInput, "dateRange" | "startDate" | "endDate">,
  today: Date = new Date(),
): { startDate: string; endDate: string } {
  if (input.startDate && input.endDate) {
    return { startDate: input.startDate, endDate: input.endDate };
  }

  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() - GA4_DATA_LAG_DAYS);
  const start = subtractRange(end, input.dateRange ?? "last_28_days");
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

function toFilterExpression(filter: Ga4PerformanceFilter): Ga4FilterExpression {
  const matchType: "EXACT" | "CONTAINS" =
    filter.operator === "contains" || filter.operator === "notContains"
      ? "CONTAINS"
      : "EXACT";
  const stringFilter = {
    filter: {
      fieldName: filter.dimension,
      stringFilter: {
        matchType,
        value: filter.expression,
        caseSensitive: false,
      },
    },
  };
  if (filter.operator === "notEquals" || filter.operator === "notContains") {
    return { notExpression: stringFilter };
  }
  return stringFilter;
}

/** Wrap flat `filters` into a GA4 `FilterExpression`. A single filter maps
 *  directly to `filter`/`notExpression`; more than one is AND-combined —
 *  matching how the Search Console tool always ANDs its flat filter list. */
function buildDimensionFilter(
  filters: Ga4PerformanceFilter[],
): Ga4FilterExpression {
  const expressions = filters.map(toFilterExpression);
  return expressions.length === 1
    ? expressions[0]
    : { andGroup: { expressions } };
}

/** Build the GA4 `runReport` body from validated tool input. */
export function buildRunReportRequest(
  input: Ga4PerformanceInput,
  today: Date = new Date(),
): Ga4RunReportRequest {
  const { startDate, endDate } = resolveDateRange(input, today);
  const request: Ga4RunReportRequest = {
    dateRanges: [{ startDate, endDate }],
    dimensions:
      input.dimensions && input.dimensions.length > 0
        ? input.dimensions.map((name) => ({ name }))
        : [{ name: "date" }],
    metrics: input.metrics.map((name) => ({ name })),
    limit: clamp(
      input.rowLimit ?? GA4_DEFAULT_ROW_LIMIT,
      1,
      GA4_MAX_ROW_LIMIT,
    ),
  };
  if (input.startRow && input.startRow > 0) {
    request.offset = input.startRow;
  }
  if (input.filters && input.filters.length > 0) {
    request.dimensionFilter = buildDimensionFilter(input.filters);
  }
  return request;
}
