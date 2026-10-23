import {
  ga4DateInTimeZone,
  inclusiveGa4Days,
  shiftGa4Date,
} from "@/server/features/ga4/services/Ga4Dates";
import {
  comparisonValue,
  previousPeriod,
} from "@/server/features/ga4/services/Ga4ReportEnhancements";
import { UmamiService } from "@/server/features/umami/services/UmamiService";
import type { UmamiStats, UmamiTimeRange } from "@/server/lib/umamiClient";
import { UmamiError } from "@/server/lib/umamiErrors";

export type UmamiChannel = "organic_search" | "all";
type UmamiReportKind =
  | "landing_pages"
  | "page_performance"
  | "referrers"
  | "channels";

type DateRange = { startDate: string; endDate: string };

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1_000;

// Umami's referrer filter accepts a `re.` regex (Umami v3+), run as a
// case-insensitive Postgres or ClickHouse (RE2) match, so no lookaheads. The
// filter is event-level: it matches only the entry pageview of a search visit,
// which carries the external referrer. That is right for counting visits and
// visitors per entry page or referrer, and wrong for anything that needs the
// rest of the visit (pageviews, bounces, time), so those come from Umami's own
// per-visit channel report instead. Subdomain labels are limited to www, m,
// search and two-letter regions, so gemini.google.com or news.google.com
// don't count as search.
const ORGANIC_REFERRER_FILTER =
  "re.^((www|m|[a-z]{2})\\.)?(([a-z]{2}\\.)?search\\.)?(google|bing|duckduckgo|ecosia|yandex|baidu|yahoo|qwant|startpage|brave|naver|seznam|msn)\\.|^ya\\.ru$|^com\\.google\\.android\\.googlequicksearchbox";

// Umami's name for search-engine visits in its channel report.
const ORGANIC_CHANNEL = "organicSearch";

// Umami silently switches `unit=day` to months once a range spans more than
// seven calendar months, so longer trends are requested monthly up front.
const MAX_DAILY_TREND_DAYS = 180;

const REPORTS = {
  landing_pages: {
    type: "entry",
    dimension: "landingPage",
    metrics: ["visits", "visitors"],
  },
  page_performance: {
    type: "path",
    dimension: "pagePath",
    metrics: ["pageviews", "visitors", "visits"],
  },
  referrers: {
    type: "referrer",
    dimension: "referrer",
    metrics: ["visits", "visitors"],
  },
  channels: {
    type: "channel",
    dimension: "channel",
    metrics: ["visits", "visitors", "pageviews"],
  },
} as const;

function parseDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  );
}

/** Same defaults as the GA4 reports: the last 28 complete days in the
 *  connection's time zone, with a future endDate moved back to yesterday. */
function resolveUmamiDateRange(
  input: { startDate?: string; endDate?: string },
  timeZone: string,
  now: Date = new Date(),
) {
  if (Boolean(input.startDate) !== Boolean(input.endDate)) {
    throw new UmamiError(
      "validation_error",
      "Provide both startDate and endDate, or neither.",
    );
  }
  const requestedDateRange =
    input.startDate && input.endDate
      ? { startDate: input.startDate, endDate: input.endDate }
      : null;
  if (
    requestedDateRange &&
    (!parseDate(requestedDateRange.startDate) ||
      !parseDate(requestedDateRange.endDate) ||
      requestedDateRange.startDate > requestedDateRange.endDate)
  ) {
    throw new UmamiError(
      "validation_error",
      "Dates must be valid YYYY-MM-DD values with startDate on or before endDate.",
    );
  }
  const lastCompleteDay = shiftGa4Date(ga4DateInTimeZone(now, timeZone), -1);
  let endDate = requestedDateRange?.endDate ?? lastCompleteDay;
  const startDate = requestedDateRange?.startDate ?? shiftGa4Date(endDate, -27);
  const warnings: string[] = [];
  if (endDate > lastCompleteDay) {
    endDate = lastCompleteDay;
    warnings.push("end_date_clamped");
  }
  if (startDate > endDate) {
    throw new UmamiError(
      "validation_error",
      "The resolved startDate is after the last complete day.",
    );
  }
  return {
    requestedDateRange,
    resolvedDateRange: { startDate, endDate },
    warnings,
  };
}

// Milliseconds the zone is ahead of UTC at this instant.
function zoneOffset(instant: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, Number(part.value)]),
  );
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Epoch milliseconds of local midnight that starts `date` in `timeZone`. */
function zonedMidnight(date: string, timeZone: string): number {
  const utcMidnight = Date.parse(`${date}T00:00:00.000Z`);
  const guess = utcMidnight - zoneOffset(utcMidnight, timeZone);
  // A DST change between the guess and midnight shifts the offset once more.
  return utcMidnight - zoneOffset(guess, timeZone);
}

function toUmamiTimeRange(range: DateRange, timeZone: string): UmamiTimeRange {
  return {
    startAt: zonedMidnight(range.startDate, timeZone),
    endAt: zonedMidnight(shiftGa4Date(range.endDate, 1), timeZone) - 1,
  };
}

const NO_TRAFFIC: UmamiStats = {
  pageviews: 0,
  visitors: 0,
  visits: 0,
  bounces: 0,
  totaltime: 0,
};

function summarize(stats: UmamiStats) {
  return {
    visits: stats.visits,
    visitors: stats.visitors,
    pageviews: stats.pageviews,
    bounceRate: stats.visits > 0 ? stats.bounces / stats.visits : null,
    avgVisitDurationSeconds:
      stats.visits > 0 ? stats.totaltime / stats.visits : null,
  };
}

const OVERVIEW_METRICS = [
  "visits",
  "visitors",
  "pageviews",
  "bounceRate",
  "avgVisitDurationSeconds",
] as const;

type Series = { x: string; y: number }[];
type TrendUnit = "day" | "month";

// Umami labels buckets "YYYY-MM-DDT00:00:00Z" in the requested zone.
function byPeriod(rows: Series, unit: TrendUnit) {
  const length = unit === "day" ? 10 : 7;
  return new Map(rows.map((row) => [row.x.slice(0, length), row.y]));
}

function periods(range: DateRange, unit: TrendUnit): string[] {
  if (unit === "day") {
    const days: string[] = [];
    for (
      let date = range.startDate;
      date <= range.endDate;
      date = shiftGa4Date(date, 1)
    ) {
      days.push(date);
    }
    return days;
  }
  const months: string[] = [];
  let [year, month] = range.startDate.split("-").map(Number);
  const last = range.endDate.slice(0, 7);
  for (;;) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (key > last) break;
    months.push(key);
    month = month === 12 ? 1 : month + 1;
    if (month === 1) year += 1;
  }
  return months;
}

/** Zero-fill the series across the range: Umami omits empty periods. With
 *  the organic filter only entry pageviews match, so pageviews are left out
 *  rather than reported as a visit count. */
function fillTrend(
  series: { pageviews: Series; sessions: Series },
  range: DateRange,
  unit: TrendUnit,
  includePageviews: boolean,
) {
  const pageviews = byPeriod(series.pageviews, unit);
  const visitors = byPeriod(series.sessions, unit);
  return periods(range, unit).map((date) => ({
    date,
    visitors: visitors.get(date) ?? 0,
    pageviews: includePageviews ? (pageviews.get(date) ?? 0) : null,
  }));
}

function source(
  connection: {
    websiteId: string;
    websiteName: string;
    websiteDomain: string | null;
  },
  instance: { baseUrl: string },
) {
  return {
    provider: "umami" as const,
    instanceUrl: instance.baseUrl,
    websiteId: connection.websiteId,
    websiteName: connection.websiteName,
    websiteDomain: connection.websiteDomain,
  };
}

async function getOverview(
  input: {
    projectId: string;
    startDate?: string;
    endDate?: string;
    channel?: UmamiChannel;
  },
  opts: { now?: Date } = {},
) {
  const { connection, instance, client } = await UmamiService.openConnection(
    input.projectId,
  );
  const channel = input.channel ?? "organic_search";
  const organic = channel === "organic_search";
  const dateRange = resolveUmamiDateRange(input, connection.timeZone, opts.now);
  const { resolvedDateRange } = dateRange;
  const previousDateRange = previousPeriod(resolvedDateRange);
  const currentRange = toUmamiTimeRange(resolvedDateRange, connection.timeZone);
  const previousRange = toUmamiTimeRange(
    previousDateRange,
    connection.timeZone,
  );
  const unit: TrendUnit =
    inclusiveGa4Days(resolvedDateRange.startDate, resolvedDateRange.endDate) >
    MAX_DAILY_TREND_DAYS
      ? "month"
      : "day";

  // Organic totals are Umami's own per-visit organicSearch channel, so
  // pageviews, bounces and time cover the whole visit.
  const totals = async (range: UmamiTimeRange): Promise<UmamiStats> => {
    if (!organic) return client.getStats(connection.websiteId, range);
    const channels = await client.getExpandedMetrics(
      connection.websiteId,
      range,
      { type: "channel", limit: MAX_LIMIT, offset: 0 },
    );
    return channels.find((row) => row.name === ORGANIC_CHANNEL) ?? NO_TRAFFIC;
  };

  const [currentStats, previousStats, series] = await Promise.all([
    totals(currentRange),
    totals(previousRange),
    client.getSeries(connection.websiteId, currentRange, {
      unit,
      timeZone: connection.timeZone,
      referrer: organic ? ORGANIC_REFERRER_FILTER : undefined,
    }),
  ]);
  const current = summarize(currentStats);
  const previous = summarize(previousStats);
  return {
    status: "ok" as const,
    source: source(connection, instance),
    request: {
      requestedDateRange: dateRange.requestedDateRange,
      resolvedDateRange,
      previousDateRange,
      timeZone: connection.timeZone,
      channel,
      trend: unit === "day" ? ("daily" as const) : ("monthly" as const),
    },
    current,
    previous,
    comparison: Object.fromEntries(
      OVERVIEW_METRICS.map((metric) => [
        metric,
        comparisonValue(current[metric], previous[metric]),
      ]),
    ),
    trend: fillTrend(series, resolvedDateRange, unit, !organic),
    warnings: dateRange.warnings,
  };
}

export type UmamiReportInput = {
  projectId: string;
  kind: UmamiReportKind;
  channel?: UmamiChannel;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
};

async function runReport(input: UmamiReportInput) {
  const limit = input.limit ?? DEFAULT_LIMIT;
  const offset = input.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new UmamiError(
      "validation_error",
      `limit must be an integer from 1 to ${MAX_LIMIT}.`,
    );
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new UmamiError(
      "validation_error",
      "offset must be a non-negative integer.",
    );
  }
  const { connection, instance, client } = await UmamiService.openConnection(
    input.projectId,
  );
  const definition = REPORTS[input.kind];
  // The channel report is itself the channel split, and pageviews per path
  // under the organic filter would count only landing hits, so neither is
  // filtered.
  const channel =
    input.kind === "channels" || input.kind === "page_performance"
      ? "all"
      : (input.channel ?? "organic_search");
  const dateRange = resolveUmamiDateRange(input, connection.timeZone);
  const range = toUmamiTimeRange(
    dateRange.resolvedDateRange,
    connection.timeZone,
  );
  const referrer =
    channel === "organic_search" ? ORGANIC_REFERRER_FILTER : undefined;

  // Umami returns no total, so one extra row tells whether another page
  // exists. Its channel report ignores limit and offset and returns every
  // channel, so that one is paged here.
  const metrics =
    input.kind === "channels"
      ? (
          await client.getExpandedMetrics(connection.websiteId, range, {
            type: definition.type,
            limit: MAX_LIMIT,
            offset: 0,
          })
        ).slice(offset, offset + limit + 1)
      : await client.getExpandedMetrics(connection.websiteId, range, {
          type: definition.type,
          limit: limit + 1,
          offset,
          referrer,
        });
  const rows = metrics.slice(0, limit).map((metric) => ({
    [definition.dimension]: metric.name,
    ...Object.fromEntries(
      definition.metrics.map((name) => [name, metric[name]]),
    ),
  }));
  return {
    status: "ok" as const,
    source: source(connection, instance),
    request: {
      reportKind: input.kind,
      requestedDateRange: dateRange.requestedDateRange,
      resolvedDateRange: dateRange.resolvedDateRange,
      timeZone: connection.timeZone,
      channel,
      dimensions: [definition.dimension],
      metrics: [...definition.metrics],
    },
    rowCount: rows.length,
    rows,
    pageInfo: { limit, offset, hasMore: metrics.length > limit },
    warnings: dateRange.warnings,
  };
}

export type UmamiReportResult = Awaited<ReturnType<typeof runReport>>;
export type UmamiOverviewResult = Awaited<ReturnType<typeof getOverview>>;

export const UmamiReportingService = { getOverview, runReport };
