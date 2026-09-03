import {
  clarityReportCoverage,
  normalizeClarityOverview,
  normalizeClarityUrlInsights,
} from "@/server/features/clarity/services/ClarityMetrics";
import type { ClarityCacheRow } from "@/server/features/clarity/repositories/ClarityRepository";
import { prepareClarityResponseForCache } from "@/server/features/clarity/services/ClarityPrivacy";
import {
  parseClarityCachedResponse,
  type ClarityDataExportResponse,
  type ClarityDimension,
} from "@/server/lib/clarityClient";
import {
  ClarityApiError,
  ClarityMalformedResponseError,
  ClarityReportError,
} from "@/server/lib/clarityErrors";

const CLARITY_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
export const CLARITY_CACHE_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const CLARITY_TRANSIENT_COOLDOWN_MS = 60_000;
const CLARITY_MALFORMED_COOLDOWN_MS = 5 * 60_000;
const CLARITY_AUTH_COOLDOWN_MS = 24 * 60 * 60_000;
const CLARITY_RATE_LIMIT_COOLDOWN_MS = 24 * 60 * 60_000;
const CLARITY_STORAGE_COOLDOWN_MS = 60 * 60_000;

export type ClarityReportKind = "overview" | "url";
export type ClarityReportDays = 1 | 2 | 3;
export type ClarityReportInput = {
  projectId: string;
  reportKind: ClarityReportKind;
  numOfDays: ClarityReportDays;
};

export const CLARITY_REPORT_DIMENSIONS: Record<
  ClarityReportKind,
  readonly ClarityDimension[]
> = {
  overview: [],
  url: ["URL"],
};

export function parseClarityCache(row: ClarityCacheRow | null): {
  data: ClarityDataExportResponse;
  fetchedAt: string;
} | null {
  if (!row) return null;
  const fetchedAt = Date.parse(row.fetchedAt);
  if (
    !Number.isFinite(fetchedAt) ||
    Date.now() - fetchedAt >= CLARITY_CACHE_RETENTION_MS
  ) {
    return null;
  }
  try {
    return {
      data: prepareClarityResponseForCache(
        parseClarityCachedResponse(JSON.parse(row.responseJson)),
        { preserveJoinKeys: true },
      ),
      fetchedAt: row.fetchedAt,
    };
  } catch {
    return null;
  }
}

export function isClarityCacheFresh(fetchedAt: string): boolean {
  const timestamp = Date.parse(fetchedAt);
  return (
    Number.isFinite(timestamp) && Date.now() - timestamp < CLARITY_CACHE_TTL_MS
  );
}

export function buildClarityReportResult(input: {
  reportKind: ClarityReportKind;
  numOfDays: ClarityReportDays;
  metrics: ClarityDataExportResponse;
  fetchedAt: string;
  hit: boolean;
  stale: boolean;
  extraWarnings?: string[];
}) {
  const coverage = clarityReportCoverage(input.metrics, input.reportKind);
  const normalized =
    input.reportKind === "overview"
      ? normalizeClarityOverview(input.metrics)
      : normalizeClarityUrlInsights(input.metrics);
  const warnings = [
    ...(input.stale ? ["stale_cache_served"] : []),
    ...(coverage.providerResponseRowLimitReached
      ? ["provider_row_limit_reached"]
      : []),
    ...(coverage.missingExpectedMetricNames.length > 0
      ? ["expected_metrics_missing"]
      : []),
    ...(coverage.unknownMetricNames.length > 0
      ? ["unknown_metrics_present"]
      : []),
    ...(coverage.duplicateMetricNames.length > 0
      ? ["duplicate_metrics_present"]
      : []),
    ...(input.metrics.some(
      (metric) =>
        (metric.openSeoOriginalInformationRows ?? metric.information.length) >
        metric.information.length,
    )
      ? ["response_truncated_for_storage"]
      : []),
    ...(input.extraWarnings ?? []),
  ];

  return {
    status: "ok" as const,
    source: {
      provider: "microsoft_clarity" as const,
      api: "data_export" as const,
      timeZone: "UTC" as const,
    },
    request: {
      reportKind: input.reportKind,
      numOfDays: input.numOfDays,
      dimensions: [...CLARITY_REPORT_DIMENSIONS[input.reportKind]],
    },
    metrics: input.metrics,
    normalized,
    coverage,
    cache: {
      hit: input.hit,
      stale: input.stale,
      fetchedAt: input.fetchedAt,
      ttlHours: CLARITY_CACHE_TTL_MS / (60 * 60 * 1_000),
      retentionDays: CLARITY_CACHE_RETENTION_MS / (24 * 60 * 60 * 1_000),
    },
    warnings: [...new Set(warnings)],
  };
}

export type ClarityReportResult = ReturnType<typeof buildClarityReportResult>;

export function clarityRefreshStateChangedError() {
  return new ClarityReportError(
    "clarity_upstream_unavailable",
    "Microsoft Clarity refresh changed state. Try again shortly.",
    2,
  );
}

export function toClarityReportError(error: unknown): ClarityReportError {
  if (error instanceof ClarityReportError) return error;
  if (error instanceof ClarityMalformedResponseError) {
    return new ClarityReportError(
      "clarity_malformed_response",
      "Microsoft Clarity returned an invalid Data Export response.",
    );
  }
  if (error instanceof ClarityApiError) {
    if (error.status === 401 || error.status === 403) {
      return new ClarityReportError(
        "clarity_reconnect_required",
        "The Microsoft Clarity token is invalid, expired, or no longer authorized.",
      );
    }
    if (error.status === 429) {
      return new ClarityReportError(
        "clarity_rate_limited",
        "Microsoft Clarity's daily Data Export limit was reached.",
        error.retryAfterSeconds,
      );
    }
    if (error.status >= 400 && error.status < 500) {
      return new ClarityReportError(
        "clarity_request_rejected",
        "Microsoft Clarity rejected the fixed Data Export request.",
      );
    }
    return new ClarityReportError(
      "clarity_upstream_unavailable",
      "Microsoft Clarity Data Export is temporarily unavailable.",
    );
  }
  // Drizzle errors can embed bind parameters, including encrypted credentials
  // and cached report JSON. Keep unknown storage/crypto errors inside this
  // feature boundary instead of forwarding their raw messages to logs or AI.
  return new ClarityReportError(
    "clarity_storage_unavailable",
    "Microsoft Clarity storage is temporarily unavailable.",
  );
}

export function canServeStaleClarityError(error: unknown): boolean {
  return (
    error instanceof ClarityMalformedResponseError ||
    (error instanceof ClarityApiError &&
      (error.status === 0 || error.status === 429 || error.status >= 500))
  );
}

export function canServeStaleReportError(error: ClarityReportError): boolean {
  return (
    error.code === "clarity_rate_limited" ||
    error.code === "clarity_upstream_unavailable" ||
    error.code === "clarity_malformed_response"
  );
}

export function clarityProviderFailure(
  error: unknown,
): ClarityReportError | null {
  return error instanceof ClarityApiError ||
    error instanceof ClarityMalformedResponseError
    ? toClarityReportError(error)
    : null;
}

export function clarityRefreshRetryAt(
  error: ClarityReportError,
  now: Date,
): string {
  let cooldownMs = CLARITY_TRANSIENT_COOLDOWN_MS;
  if (error.code === "clarity_reconnect_required") {
    cooldownMs = CLARITY_AUTH_COOLDOWN_MS;
  } else if (error.code === "clarity_rate_limited") {
    cooldownMs = Math.max(
      CLARITY_RATE_LIMIT_COOLDOWN_MS,
      (error.retryAfterSeconds ?? 0) * 1_000,
    );
  } else if (error.code === "clarity_malformed_response") {
    cooldownMs = CLARITY_MALFORMED_COOLDOWN_MS;
  } else if (error.code === "clarity_request_rejected") {
    cooldownMs = CLARITY_MALFORMED_COOLDOWN_MS;
  } else if (error.code === "clarity_storage_unavailable") {
    cooldownMs = CLARITY_STORAGE_COOLDOWN_MS;
  }
  return new Date(now.getTime() + cooldownMs).toISOString();
}

export function sharedClarityRefreshError(
  code: string,
  retryAfterSeconds: number,
): ClarityReportError | null {
  if (code === "clarity_reconnect_required") {
    return new ClarityReportError(
      code,
      "The Microsoft Clarity token is invalid, expired, or no longer authorized.",
      retryAfterSeconds,
    );
  }
  if (code === "clarity_rate_limited") {
    return new ClarityReportError(
      code,
      "Microsoft Clarity's daily Data Export limit was reached.",
      retryAfterSeconds,
    );
  }
  if (code === "clarity_malformed_response") {
    return new ClarityReportError(
      code,
      "Microsoft Clarity returned an invalid Data Export response.",
      retryAfterSeconds,
    );
  }
  if (code === "clarity_request_rejected") {
    return new ClarityReportError(
      code,
      "Microsoft Clarity rejected the fixed Data Export request.",
      retryAfterSeconds,
    );
  }
  if (code === "clarity_storage_unavailable") {
    return new ClarityReportError(
      code,
      "Microsoft Clarity storage is temporarily unavailable.",
      retryAfterSeconds,
    );
  }
  if (code === "clarity_upstream_unavailable") {
    return new ClarityReportError(
      code,
      "Microsoft Clarity Data Export is temporarily unavailable.",
      retryAfterSeconds,
    );
  }
  return null;
}
