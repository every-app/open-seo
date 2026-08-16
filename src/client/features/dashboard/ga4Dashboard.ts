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
      | "conversionEvents"
      | "conversionEventTypeCount"
      | "limitedData"
    >
  | Extract<DashboardGa4SummaryResult, { status: "error" }>;

type Ga4DashboardQueryState = {
  connected: boolean;
  isPending: boolean;
  isError: boolean;
  data: DashboardGa4Summary | undefined;
};

type Ga4DashboardViewState =
  | { kind: "hidden" }
  | { kind: "loading" }
  | {
      kind: "error";
      message: string;
      code: string;
      retryAfterSeconds?: number;
    }
  | {
      kind: "success";
      data: Pick<
        SuccessfulDashboardGa4Summary,
        | "metrics"
        | "previous"
        | "topPages"
        | "topCities"
        | "conversionEvents"
        | "conversionEventTypeCount"
        | "limitedData"
      >;
      summaryUnavailable: boolean;
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
      code: "transport_error",
      message:
        "We couldn't load Google Analytics data. Review the connection and try again.",
    };
  }
  if (query.data.status === "error") {
    const isQuotaError = query.data.error.code === "ga4_quota_exhausted";
    return {
      kind: "error",
      code: query.data.error.code,
      message: recoveryMessage(query.data.error.code),
      ...(isQuotaError
        ? { retryAfterSeconds: query.data.error.retryAfterSeconds ?? 60 }
        : {}),
    };
  }

  const response = query.data;
  const data = {
    metrics: response.metrics,
    previous: response.previous,
    topPages: response.topPages,
    topCities: response.topCities,
    conversionEvents: response.conversionEvents,
    conversionEventTypeCount: response.conversionEventTypeCount,
    limitedData: response.limitedData,
  };
  return {
    kind: "success",
    data,
    summaryUnavailable: Object.values(data.metrics).every(
      (value) => value === null,
    ),
  };
}

function recoveryMessage(code: string): string {
  if (code === "ga4_reconnect_required" || code === "ga4_not_connected") {
    return "Google Analytics access needs to be reconnected.";
  }
  if (code === "ga4_property_inaccessible") {
    return "This Google Analytics property is no longer accessible.";
  }
  if (code === "ga4_quota_exhausted") {
    return "Google Analytics is temporarily rate-limited.";
  }
  return "Google Analytics couldn't return this report. Try again shortly or review the connection.";
}

export function ga4DashboardHasDataForSort(input: {
  gscConnected: boolean;
  ga4Connected: boolean;
}): boolean {
  return input.gscConnected && input.ga4Connected;
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

export function formatGa4CountWithUnit(
  value: number | null,
  singularUnit: string,
): string {
  if (value === null) return "—";
  const unit = value === 1 ? singularUnit : `${singularUnit}s`;
  return `${formatGa4Count(value)} ${unit}`;
}

export function formatGa4Rate(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString(undefined, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

function titleCaseGa4EventParts(parts: string[]): string {
  return parts
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function formatGa4EventName(eventName: string): string {
  const parts = eventName
    .trim()
    .split(/[_\s-]+/)
    .filter(Boolean);

  if (parts[0] === "form" && parts[1] === "submit") {
    const detail = titleCaseGa4EventParts(parts.slice(2));
    return detail ? `${detail} form submission` : "Form submission";
  }
  if (parts[0] === "phone" && parts[1] === "click") {
    const detail = titleCaseGa4EventParts(parts.slice(2));
    return detail ? `${detail} phone click` : "Phone click";
  }
  return titleCaseGa4EventParts(parts);
}
