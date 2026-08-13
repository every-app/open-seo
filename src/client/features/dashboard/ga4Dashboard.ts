import type { DashboardGa4SummaryResult } from "@/serverFunctions/ga4";

type SuccessfulDashboardGa4Summary = Extract<
  DashboardGa4SummaryResult,
  { status: "ok" }
>;

export type DashboardGa4Summary =
  | Pick<
      SuccessfulDashboardGa4Summary,
      | "status"
      | "metrics"
      | "previous"
      | "topPages"
      | "topCities"
      | "limitedData"
    >
  | Extract<DashboardGa4SummaryResult, { status: "error" }>;

type Ga4DashboardQueryState = {
  connected: boolean;
  isPending: boolean;
  isError: boolean;
  data: DashboardGa4Summary | undefined;
};

export type Ga4DashboardViewState =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "success";
      data: Ga4DashboardDisplayData;
      summaryUnavailable: boolean;
      pagesEmpty: boolean;
      citiesEmpty: boolean;
      limited: boolean;
    };

export type Ga4DashboardDisplayData = {
  metrics: {
    visits: number | null;
    conversions: number | null;
    conversionRate: number | null;
    engagementRate: number | null;
  };
  previous: {
    visits: number | null;
    conversions: number | null;
  };
  topPages: Array<{ title: string; path: string; views: number | null }>;
  topCities: Array<{ city: string; visits: number | null }>;
  limitedData: {
    summary: boolean;
    pages: boolean;
    cities: boolean;
  };
};

/**
 * Keeps the component branches deterministic and testable without requiring a
 * browser DOM. Expected GA4 failures are returned as data, while an unexpected
 * transport failure still reaches the same single recovery state.
 */
export function getGa4DashboardViewState(
  query: Ga4DashboardQueryState,
): Ga4DashboardViewState {
  if (!query.connected) return { kind: "hidden" };
  if (query.isPending) return { kind: "loading" };
  if (query.isError || !query.data) {
    return {
      kind: "error",
      message:
        "We couldn't load Google Analytics data. Review the connection and try again.",
    };
  }
  if (query.data.status === "error") {
    return {
      kind: "error",
      message: recoveryMessage(query.data.error.code),
    };
  }

  const response = query.data;
  const data: Ga4DashboardDisplayData = {
    metrics: response.metrics,
    previous: response.previous,
    topPages: response.topPages,
    topCities: response.topCities,
    limitedData: response.limitedData,
  };
  return {
    kind: "success",
    data,
    summaryUnavailable: Object.values(data.metrics).every(
      (value) => value === null,
    ),
    pagesEmpty: data.topPages.length === 0,
    citiesEmpty: data.topCities.length === 0,
    limited: Object.values(data.limitedData).some(Boolean),
  };
}

function recoveryMessage(code: string): string {
  if (code === "ga4_reconnect_required" || code === "ga4_not_connected") {
    return "Google Analytics access needs to be reconnected.";
  }
  if (code === "ga4_property_inaccessible") {
    return "This Google Analytics property is no longer accessible.";
  }
  return "Google Analytics couldn't return this report. Try again shortly or review the connection.";
}

export function shouldShowDashboardGa4(input: {
  hosted: boolean;
  oauthAppPending: boolean;
  connected: boolean;
  dismissedAt: string | null;
}): boolean {
  // The pending OAuth approval is a hosted-connect restriction, not a global
  // GA4 kill switch. Existing connections and self-hosted OAuth keep working.
  if (input.connected || !input.hosted) return true;
  if (input.oauthAppPending) return false;
  return input.dismissedAt === null;
}

export function formatGa4Count(value: number | null): string {
  return value === null ? "—" : value.toLocaleString();
}

export function formatGa4Rate(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString(undefined, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}
