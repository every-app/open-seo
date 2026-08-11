import { GscService } from "@/server/features/gsc/services/GscService";
import { GscNotConnectedError } from "@/server/lib/gscErrors";
import {
  Ga4ReportingService,
  resolveGa4DateRange,
} from "@/server/features/ga4/services/Ga4ReportingService";
import { Ga4ReportError } from "@/server/lib/ga4Errors";
import { Ga4ConnectionRepository } from "@/server/features/ga4/repositories/Ga4ConnectionRepository";
import { ga4DateInTimeZone, shiftGa4Date } from "./Ga4Dates";

type SearchOpportunityInput = {
  projectId: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
};

type Candidate = {
  page: string;
  normalizedPage: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  joinStatus: "joined" | "gsc_only";
  ga4: {
    sessions: number;
    activeUsers: number;
    engagedSessions: number;
    engagementRate: number;
    keyEvents: number;
    sessionKeyEventRate: number;
    transactions: number;
    purchaseRevenue: number | null;
  } | null;
  score: number | null;
  scoreComponents: {
    demand: number;
    businessValue: number;
    reachability: number;
  } | null;
};

function resolveCombinedDates(
  input: Pick<SearchOpportunityInput, "startDate" | "endDate">,
  propertyTimeZone: string,
  now: Date,
) {
  if (!input.startDate && !input.endDate) {
    const endDate = shiftGa4Date(ga4DateInTimeZone(now, propertyTimeZone), -3);
    return {
      startDate: shiftGa4Date(endDate, -27),
      endDate,
    };
  }
  return resolveGa4DateRange(input, propertyTimeZone, now).resolvedDateRange;
}

function normalizePageKey(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "(not set)") return null;
  try {
    const url = new URL(
      trimmed.includes("://") ? trimmed : `https://${trimmed}`,
    );
    let host = url.hostname.toLowerCase();
    const defaultPort =
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443");
    if (url.port && !defaultPort) host += `:${url.port}`;
    let path = url.pathname || "/";
    if (path.length > 1) path = path.replace(/\/+$/, "");
    return `${host}${path}`;
  } catch {
    return null;
  }
}

function numberField(
  row: Record<string, string | number | null>,
  name: string,
): number {
  const value = row[name];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function percentileRanks(values: number[]): number[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [1];
  return values.map((value) => {
    const lower = values.filter((candidate) => candidate < value).length;
    return lower / (values.length - 1);
  });
}

function roundComponent(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

async function getOpportunities(
  input: SearchOpportunityInput,
  opts: { now?: Date } = {},
) {
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Ga4ReportError(
      "validation_error",
      "limit must be an integer from 1 to 100.",
    );
  }
  const [ga4Connection, gscConnection] = await Promise.all([
    Ga4ConnectionRepository.getByProjectId(input.projectId),
    GscService.getConnection(input.projectId),
  ]);
  if (!ga4Connection) {
    throw new Ga4ReportError(
      "ga4_not_connected",
      "Google Analytics is not connected for this project.",
    );
  }
  if (!gscConnection) throw new GscNotConnectedError(input.projectId);

  const now = opts.now ?? new Date();
  const dates = resolveCombinedDates(
    input,
    ga4Connection.propertyTimeZone,
    now,
  );
  const gsc = await GscService.getPerformance({
    projectId: input.projectId,
    dimensions: ["page"],
    startDate: dates.startDate,
    endDate: dates.endDate,
    rowLimit: 1_000,
    startRow: 0,
    type: "web",
    dataState: "final",
  });
  const ga4 = await Ga4ReportingService.runReport({
    projectId: input.projectId,
    kind: "landing_pages",
    startDate: dates.startDate,
    endDate: dates.endDate,
    limit: 1_000,
    offset: 0,
    channel: "organic_search",
  });

  const ga4ByPage = new Map<string, Record<string, string | number | null>>();
  let invalidGa4Rows = 0;
  for (const row of ga4.rows) {
    const host = typeof row.hostName === "string" ? row.hostName : "";
    const landing = typeof row.landingPage === "string" ? row.landingPage : "";
    const key = normalizePageKey(`${host}${landing}`);
    if (!key) {
      invalidGa4Rows += 1;
      continue;
    }
    ga4ByPage.set(key, row);
  }

  const candidates: Candidate[] = gsc.rows
    .filter((row) => row.position >= 4 && row.position <= 20)
    .map((row) => {
      const page = row.keys?.[0] ?? "";
      const normalizedPage = normalizePageKey(page);
      const analytics = normalizedPage
        ? ga4ByPage.get(normalizedPage)
        : undefined;
      return {
        page,
        normalizedPage,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
        joinStatus: analytics ? "joined" : "gsc_only",
        ga4: analytics
          ? {
              sessions: numberField(analytics, "sessions"),
              activeUsers: numberField(analytics, "activeUsers"),
              engagedSessions: numberField(analytics, "engagedSessions"),
              engagementRate: numberField(analytics, "engagementRate"),
              keyEvents: numberField(analytics, "keyEvents"),
              sessionKeyEventRate: numberField(
                analytics,
                "sessionKeyEventRate",
              ),
              transactions: numberField(analytics, "transactions"),
              purchaseRevenue:
                typeof analytics.purchaseRevenue === "number"
                  ? analytics.purchaseRevenue
                  : null,
            }
          : null,
        score: null,
        scoreComponents: null,
      } satisfies Candidate;
    });

  const joined = candidates.filter(
    (
      candidate,
    ): candidate is Candidate & { ga4: NonNullable<Candidate["ga4"]> } =>
      candidate.ga4 !== null,
  );
  const engagementFallback =
    joined.length > 0 &&
    joined.every((candidate) => candidate.ga4.keyEvents === 0);
  const demand = percentileRanks(
    joined.map((candidate) => Math.log1p(candidate.impressions)),
  );
  const businessValue = percentileRanks(
    joined.map((candidate) =>
      engagementFallback
        ? candidate.ga4.engagementRate
        : candidate.ga4.sessionKeyEventRate,
    ),
  );
  const reachability = percentileRanks(
    joined.map((candidate) => 20 - candidate.position),
  );
  joined.forEach((candidate, index) => {
    const components = {
      demand: roundComponent(demand[index] ?? 0),
      businessValue: roundComponent(businessValue[index] ?? 0),
      reachability: roundComponent(reachability[index] ?? 0),
    };
    candidate.scoreComponents = components;
    candidate.score = Math.round(
      100 *
        (0.5 * components.demand +
          0.3 * components.businessValue +
          0.2 * components.reachability),
    );
  });
  candidates.sort((a, b) => {
    if (a.score == null && b.score != null) return 1;
    if (a.score != null && b.score == null) return -1;
    return (b.score ?? 0) - (a.score ?? 0) || b.impressions - a.impressions;
  });

  const matchedRows = joined.length;
  const unmatchedGscRows = candidates.length - matchedRows;
  const returned = candidates.slice(0, limit);
  return {
    status: "ok" as const,
    source: {
      searchConsoleSiteUrl: gsc.siteUrl,
      googleAnalyticsPropertyId: ga4.source.propertyId,
      googleAnalyticsPropertyDisplayName: ga4.source.propertyDisplayName,
    },
    request: {
      dateRange: dates,
      limit,
      searchConsoleTimeZone: "America/Los_Angeles",
      googleAnalyticsTimeZone: ga4.request.propertyTimeZone,
    },
    rowCount: returned.length,
    totalCandidateRows: candidates.length,
    rows: returned,
    scoring: {
      formula:
        "round(100 * (0.5 * demand + 0.3 * businessValue + 0.2 * reachability))",
      businessValueMetric: engagementFallback
        ? "engagementRate"
        : "sessionKeyEventRate",
      engagementFallback,
      scoreDataLimited: ga4.reportMetadata.hasLimitedData,
    },
    coverage: {
      gscRowsConsidered: gsc.rows.length,
      ga4RowsConsidered: ga4.rows.length,
      matchedRows,
      unmatchedGscRows,
      unmatchedGa4Rows:
        Math.max(ga4ByPage.size - matchedRows, 0) + invalidGa4Rows,
    },
    truncated: {
      gsc: gsc.rows.length >= 1_000,
      ga4: ga4.totalRowCount > ga4.rows.length,
      candidates: returned.length < candidates.length,
    },
    warnings:
      ga4.request.propertyTimeZone === "America/Los_Angeles"
        ? ga4.warnings
        : [...ga4.warnings, "source_time_zones_differ"],
    reportMetadata: ga4.reportMetadata,
    quota: ga4.quota,
  };
}

export const SearchOpportunityService = { getOpportunities };
