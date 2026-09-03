import {
  CLARITY_URL_JOIN_KEY,
  type ClarityDataExportResponse,
} from "@/server/lib/clarityClient";

export { CLARITY_URL_JOIN_KEY } from "@/server/lib/clarityClient";

type ClarityInformation =
  ClarityDataExportResponse[number]["information"][number];

// D1 permits 2 MB string values. Keep ample room for SQL/JSON overhead and
// future schema metadata while still retaining the same leading rows Clarity
// returns for every metric group.
const CLARITY_CACHE_JSON_MAX_BYTES = 1_500_000;
const URL_FIELD_NAMES = ["URL", "Url", "url"] as const;
const URL_FIELD_NAME_SET: ReadonlySet<string> = new Set(URL_FIELD_NAMES);

function urlDimensionValue(information: ClarityInformation): string | null {
  for (const key of URL_FIELD_NAMES) {
    const value = information[key];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

export function privacySafeClarityUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return value.split(/[?#]/u, 1)[0] ?? value;
    }
    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split(/[?#]/u, 1)[0] ?? value;
  }
}

export function sanitizeClarityInformation(
  information: ClarityInformation,
  metricName?: string,
): ClarityInformation {
  return Object.fromEntries(
    Object.entries(information)
      // Provider-controlled fields must never be able to inject our internal
      // non-sensitive join key. sanitizeClarityResponse adds a fresh key.
      .filter(([key]) => key !== CLARITY_URL_JOIN_KEY)
      .map(([key, value]) => [
        key,
        typeof value === "string" &&
        (URL_FIELD_NAME_SET.has(key) ||
          /^https?:\/\//iu.test(value.trim()) ||
          (metricName === "ReferrerUrl" && key === "name"))
          ? privacySafeClarityUrl(value)
          : value,
      ]),
  );
}

export function sanitizeClarityResponse(
  response: ClarityDataExportResponse,
  options: { preserveJoinKeys?: boolean } = {},
): ClarityDataExportResponse {
  // Query/fragment removal can make distinct provider URLs render identically.
  // Assign an opaque response-local key before redaction so metric groups keep
  // joining to the correct variant without persisting a hash or any reversible
  // derivative of the sensitive URL.
  const urlJoinKeys = new Map<string, string>();
  const joinKeyFor = (rawUrl: string) => {
    const existing = urlJoinKeys.get(rawUrl);
    if (existing) return existing;
    const key = `url-${String(urlJoinKeys.size + 1).padStart(6, "0")}`;
    urlJoinKeys.set(rawUrl, key);
    return key;
  };

  return response.map((metric) => ({
    ...metric,
    information: metric.information.map((information) => {
      const rawUrl = urlDimensionValue(information);
      const existingJoinKey = information[CLARITY_URL_JOIN_KEY];
      const sanitized = sanitizeClarityInformation(
        information,
        metric.metricName,
      );
      const preservedJoinKey =
        options.preserveJoinKeys &&
        typeof existingJoinKey === "string" &&
        /^url-\d{6}$/u.test(existingJoinKey)
          ? existingJoinKey
          : null;
      return rawUrl
        ? {
            ...sanitized,
            [CLARITY_URL_JOIN_KEY]: preservedJoinKey ?? joinKeyFor(rawUrl),
          }
        : sanitized;
    }),
  }));
}

function utf8Bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function rowsBoundedResponse(
  response: ClarityDataExportResponse,
  rowsPerMetric: number,
): ClarityDataExportResponse {
  return response.map((metric) => {
    const originalRows =
      metric.openSeoOriginalInformationRows ?? metric.information.length;
    const information = metric.information.slice(0, rowsPerMetric);
    return {
      ...metric,
      information,
      ...(information.length < originalRows
        ? { openSeoOriginalInformationRows: originalRows }
        : {}),
    };
  });
}

export function prepareClarityResponseForCache(
  response: ClarityDataExportResponse,
  options: { preserveJoinKeys?: boolean } = {},
): ClarityDataExportResponse {
  const sanitized = sanitizeClarityResponse(response, options);
  if (utf8Bytes(sanitized) <= CLARITY_CACHE_JSON_MAX_BYTES) return sanitized;

  let low = 0;
  let high = Math.max(
    0,
    ...sanitized.map((metric) => metric.information.length),
  );
  let best = rowsBoundedResponse(sanitized, 0);
  while (low <= high) {
    const midpoint = Math.floor((low + high) / 2);
    const candidate = rowsBoundedResponse(sanitized, midpoint);
    if (utf8Bytes(candidate) <= CLARITY_CACHE_JSON_MAX_BYTES) {
      best = candidate;
      low = midpoint + 1;
    } else {
      high = midpoint - 1;
    }
  }
  return best;
}
