import type { Ga4RunReportRequest } from "@/server/lib/ga4Client";

export type Ga4Channel = "organic_search" | "all";
export type Ga4ReportKind =
  | "landing_pages"
  | "page_performance"
  | "key_events"
  | "traffic_acquisition"
  | "ecommerce_performance"
  | "site_search"
  | "audience_breakdown";

type Ga4ReportRequestInput = {
  kind: Ga4ReportKind;
  startDate: string;
  endDate: string;
  channel: Ga4Channel;
  limit: number;
  offset: number;
  includeDate?: boolean;
  breakdown?: "event" | "event_and_landing_page";
  acquisitionBreakdown?: "channel_group" | "source_medium" | "campaign";
  ecommerceBreakdown?: "item" | "landing_page";
  ecommerceOnlyWithTransactions?: boolean;
  audienceBreakdown?: "device" | "country" | "new_vs_returning";
};

const REPORT_DEFINITIONS = {
  landing_pages: {
    dimensions: ["hostName", "landingPage"],
    metrics: [
      "sessions",
      "activeUsers",
      "engagedSessions",
      "engagementRate",
      "keyEvents",
      "sessionKeyEventRate",
      "transactions",
      "purchaseRevenue",
    ],
    orderMetric: "sessions",
  },
  page_performance: {
    dimensions: ["hostName", "pagePath"],
    metrics: [
      "screenPageViews",
      "activeUsers",
      "userEngagementDuration",
      "keyEvents",
    ],
    orderMetric: "screenPageViews",
  },
  key_events: {
    dimensions: ["eventName"],
    metrics: ["keyEvents", "totalUsers"],
    orderMetric: "keyEvents",
  },
  traffic_acquisition: {
    dimensions: ["sessionDefaultChannelGroup"],
    metrics: [
      "sessions",
      "activeUsers",
      "engagedSessions",
      "engagementRate",
      "keyEvents",
      "transactions",
      "purchaseRevenue",
    ],
    orderMetric: "sessions",
  },
  ecommerce_performance: {
    dimensions: ["itemName", "itemId"],
    metrics: [
      "itemsViewed",
      "itemsAddedToCart",
      "itemsPurchased",
      "itemRevenue",
    ],
    orderMetric: "itemRevenue",
  },
  site_search: {
    dimensions: ["searchTerm"],
    metrics: [
      "eventCount",
      "activeUsers",
      "sessions",
      "engagedSessions",
      "engagementRate",
    ],
    orderMetric: "eventCount",
  },
  audience_breakdown: {
    dimensions: ["deviceCategory"],
    metrics: ["activeUsers", "sessions", "engagementRate", "keyEvents"],
    orderMetric: "activeUsers",
  },
} as const;

export const OVERVIEW_METRICS = [
  "sessions",
  "activeUsers",
  "engagedSessions",
  "engagementRate",
  "keyEvents",
  "transactions",
  "purchaseRevenue",
] as const;

function organicFilter() {
  return {
    filter: {
      fieldName: "sessionDefaultChannelGroup",
      stringFilter: { matchType: "EXACT", value: "Organic Search" },
    },
  };
}

function reportDefinition(input: Ga4ReportRequestInput) {
  if (
    input.kind === "ecommerce_performance" &&
    input.ecommerceBreakdown === "landing_page"
  ) {
    return {
      dimensions: ["hostName", "landingPage"] as const,
      metrics: ["sessions", "transactions", "purchaseRevenue"] as const,
      orderMetric: "purchaseRevenue",
    };
  }
  return REPORT_DEFINITIONS[input.kind];
}

function reportDimensions(
  input: Ga4ReportRequestInput,
  defaults: readonly string[],
): string[] {
  if (input.kind === "traffic_acquisition") {
    return [
      {
        channel_group: "sessionDefaultChannelGroup",
        source_medium: "sessionSourceMedium",
        campaign: "sessionCampaignName",
      }[input.acquisitionBreakdown ?? "channel_group"],
    ];
  }
  if (input.kind === "audience_breakdown") {
    return [
      {
        device: "deviceCategory",
        country: "country",
        new_vs_returning: "newVsReturning",
      }[input.audienceBreakdown ?? "device"],
    ];
  }
  const dimensions = [...defaults];
  if (input.kind === "page_performance" && input.includeDate) {
    dimensions.push("date");
  }
  if (
    input.kind === "key_events" &&
    input.breakdown === "event_and_landing_page"
  ) {
    dimensions.push("hostName", "landingPage");
  }
  return dimensions;
}

function reportFilter(input: Ga4ReportRequestInput): unknown {
  if (input.kind === "site_search") {
    return {
      andGroup: {
        expressions: [
          {
            filter: {
              fieldName: "eventName",
              stringFilter: {
                matchType: "EXACT",
                value: "view_search_results",
              },
            },
          },
          {
            notExpression: {
              filter: {
                fieldName: "searchTerm",
                stringFilter: { matchType: "EXACT", value: "(not set)" },
              },
            },
          },
        ],
      },
    };
  }
  return input.channel === "organic_search" ? organicFilter() : undefined;
}

function metricFilter(input: Ga4ReportRequestInput): unknown {
  if (input.kind === "key_events") {
    return {
      filter: {
        fieldName: "keyEvents",
        numericFilter: {
          operation: "GREATER_THAN",
          value: { doubleValue: 0 },
        },
      },
    };
  }
  if (
    input.kind === "ecommerce_performance" &&
    input.ecommerceBreakdown === "landing_page" &&
    input.ecommerceOnlyWithTransactions
  ) {
    return {
      filter: {
        fieldName: "transactions",
        numericFilter: {
          operation: "GREATER_THAN",
          value: { doubleValue: 0 },
        },
      },
    };
  }
  return undefined;
}

function effectiveBreakdown(input: Ga4ReportRequestInput): string {
  if (input.kind === "landing_pages") return "landing_page";
  if (input.kind === "page_performance") {
    return input.includeDate ? "page_and_date" : "page";
  }
  if (input.kind === "key_events") return input.breakdown ?? "event";
  if (input.kind === "traffic_acquisition") {
    return input.acquisitionBreakdown ?? "channel_group";
  }
  if (input.kind === "ecommerce_performance") {
    return input.ecommerceBreakdown ?? "item";
  }
  if (input.kind === "site_search") return "search_term";
  return input.audienceBreakdown ?? "device";
}

export function getGa4ReportConfiguration(input: Ga4ReportRequestInput) {
  const definition = reportDefinition(input);
  return {
    reportKind: input.kind,
    breakdown: effectiveBreakdown(input),
    dimensions: reportDimensions(input, definition.dimensions),
    metrics: [...definition.metrics],
    flags: {
      includeDate: input.includeDate ?? false,
      onlyWithTransactions: input.ecommerceOnlyWithTransactions ?? false,
    },
  };
}

export function buildGa4ReportRequest(
  input: Ga4ReportRequestInput,
): Ga4RunReportRequest {
  const definition = reportDefinition(input);
  const dimensions = reportDimensions(input, definition.dimensions);
  return {
    dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
    dimensions: dimensions.map((name) => ({ name })),
    metrics: definition.metrics.map((name) => ({ name })),
    dimensionFilter: reportFilter(input),
    metricFilter: metricFilter(input),
    offset: String(input.offset),
    limit: String(input.limit),
    orderBys: [{ metric: { metricName: definition.orderMetric }, desc: true }],
    keepEmptyRows: false,
    returnPropertyQuota: true,
  };
}

export function buildGa4OverviewRequest(input: {
  startDate: string;
  endDate: string;
  trend?: "daily" | "weekly";
}): Ga4RunReportRequest {
  const dimensions = input.trend
    ? [{ name: input.trend === "daily" ? "date" : "yearWeek" }]
    : [];
  return {
    dateRanges: [{ startDate: input.startDate, endDate: input.endDate }],
    dimensions,
    metrics: OVERVIEW_METRICS.map((name) => ({ name })),
    dimensionFilter: organicFilter(),
    offset: "0",
    limit: input.trend ? "1000" : "1",
    orderBys: input.trend
      ? [{ dimension: { dimensionName: dimensions[0]?.name ?? "date" } }]
      : [],
    keepEmptyRows: false,
    returnPropertyQuota: true,
  };
}
