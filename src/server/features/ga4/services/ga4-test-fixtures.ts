import type { Ga4Connection } from "@/server/features/ga4/repositories/Ga4ConnectionRepository";
import type { Ga4ReportResult } from "./Ga4ReportingService";

export function makeGa4Connection(
  overrides: Partial<Ga4Connection> = {},
): Ga4Connection {
  return {
    id: "ga4_connection_1",
    projectId: "project_1",
    organizationId: "org_123",
    propertyId: "properties/123",
    propertyDisplayName: "Example",
    propertyTimeZone: "America/New_York",
    propertyCurrencyCode: "USD",
    connectedByUserId: "user_1",
    ga4AccountId: "account_1",
    connectedAccountEmail: "alice@example.com",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

type Ga4ReportResultOverrides = Omit<
  Partial<Ga4ReportResult>,
  "source" | "request" | "pageInfo" | "reportMetadata"
> & {
  source?: Partial<Ga4ReportResult["source"]>;
  request?: Partial<Ga4ReportResult["request"]>;
  pageInfo?: Partial<Ga4ReportResult["pageInfo"]>;
  reportMetadata?: Partial<Ga4ReportResult["reportMetadata"]>;
};

export function makeGa4ReportResult(
  overrides: Ga4ReportResultOverrides = {},
): Ga4ReportResult {
  const { source, request, pageInfo, reportMetadata, ...topLevelOverrides } =
    overrides;
  const result = {
    status: "ok",
    source: {
      provider: "google_analytics",
      propertyId: "properties/123",
      propertyDisplayName: "Example",
    },
    request: {
      requestedDateRange: null,
      resolvedDateRange: { startDate: "2026-07-09", endDate: "2026-08-05" },
      propertyTimeZone: "America/New_York",
      currencyCode: "USD",
      channel: "organic_search",
      reportKind: "landing_pages",
      breakdown: "landing_page",
      dimensions: ["hostName", "landingPage"],
      metrics: ["sessions"],
      flags: { includeDate: false, onlyWithTransactions: false },
      limit: 100,
      offset: 0,
    },
    rowCount: 0,
    totalRowCount: 0,
    rows: [],
    pageInfo: { offset: 0, limit: 100, hasMore: false, nextOffset: null },
    reportMetadata: {
      dataLossFromOtherRow: false,
      subjectToThresholding: false,
      sampling: [],
      restrictedMetrics: [],
      emptyReason: null,
      hasLimitedData: false,
    },
    quota: null,
    warnings: [],
    diagnostics: [],
    comparison: undefined,
  };
  const merged = {
    ...result,
    ...topLevelOverrides,
    source: { ...result.source, ...source },
    request: { ...result.request, ...request },
    pageInfo: { ...result.pageInfo, ...pageInfo },
    reportMetadata: { ...result.reportMetadata, ...reportMetadata },
  };
  // Tests intentionally override rows from several report-kind variants.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return merged as Ga4ReportResult;
}
