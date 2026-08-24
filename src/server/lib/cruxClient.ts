import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import { CruxApiError, messageForStatus } from "./cruxErrors";

const CRUX_API_BASE = "https://chromeuxreport.googleapis.com/v1";
// Safety ceiling on any live call; CrUX answers well under this.
const CRUX_REQUEST_TIMEOUT_MS = 30_000;
// Retry idempotent reads on transient 5xx. Total attempts = retries + 1; the
// shared request-timeout signal still caps overall wall time.
const CRUX_MAX_RETRIES = 2;
const CRUX_RETRY_BACKOFF_MS = 250;

export type CruxFormFactor = "PHONE" | "DESKTOP" | "TABLET";

export type CruxDate = { year: number; month: number; day: number };

// CLS values arrive as strings on the wire ("0.05"); time metrics as numbers.
type CruxWireNumber = number | string;

export type CruxHistogramBin = {
  start?: CruxWireNumber;
  end?: CruxWireNumber;
  density?: number;
};

export type CruxMetric = {
  histogram?: CruxHistogramBin[];
  percentiles?: { p75?: CruxWireNumber };
};

/** Subset of a `records:queryRecord` record we surface; extra fields are
 *  ignored. */
export type CruxRecord = {
  key?: { origin?: string; url?: string; formFactor?: string };
  metrics?: Record<string, CruxMetric>;
  collectionPeriod?: { firstDate: CruxDate; lastDate: CruxDate };
};

export type CruxHistoryMetric = {
  histogramTimeseries?: Array<{
    start?: CruxWireNumber;
    end?: CruxWireNumber;
    densities?: Array<number | null>;
  }>;
  percentilesTimeseries?: { p75s?: Array<CruxWireNumber | null> };
};

/** Subset of a `records:queryHistoryRecord` record we surface. Timeseries
 *  arrays align index-for-index with `collectionPeriods`. */
export type CruxHistoryRecord = {
  key?: { origin?: string; url?: string; formFactor?: string };
  metrics?: Record<string, CruxHistoryMetric>;
  collectionPeriods?: Array<{ firstDate: CruxDate; lastDate: CruxDate }>;
};

type CruxQueryInput = {
  origin?: string;
  url?: string;
  formFactor?: CruxFormFactor;
};

/** CrUX 404s when an origin/URL has too few real-user samples to publish —
 *  an expected outcome for small sites, so it is a result, not an error. */
type CruxQueryResult<TRecord> =
  | { status: "ok"; record: TRecord }
  | { status: "no_data" };

function buildRequestBody(input: CruxQueryInput): Record<string, unknown> {
  return {
    ...(input.url ? { url: input.url } : { origin: input.origin }),
    formFactor: input.formFactor ?? "PHONE",
  };
}

// Free Chrome UX Report client. Unlike the DataForSEO client it does NOT meter
// credits — CrUX is Google's public field-data API with no per-call cost. The
// API key is read lazily per request (it lives in the Worker env, not module
// scope).
async function request<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ status: "ok"; data: T } | { status: "no_data" }> {
  const apiKey = await getRequiredEnvValue("CRUX_API_KEY");
  const url = `${CRUX_API_BASE}/${path}?key=${encodeURIComponent(apiKey)}`;
  // Resolve the signal once so retries share the overall request timeout
  // rather than restarting a fresh budget on each attempt.
  const signal = AbortSignal.timeout(CRUX_REQUEST_TIMEOUT_MS);

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    if (response.ok) {
      return { status: "ok", data: (await response.json()) as T };
    }
    if (response.status === 404) {
      return { status: "no_data" };
    }
    // Transient upstream 5xx on an idempotent read -> back off and retry.
    if (response.status >= 500 && attempt < CRUX_MAX_RETRIES) {
      await new Promise((resolve) =>
        setTimeout(resolve, CRUX_RETRY_BACKOFF_MS * (attempt + 1)),
      );
      continue;
    }
    const responseBody = await response.text().catch(() => "");
    throw new CruxApiError(
      response.status,
      messageForStatus(response.status, responseBody),
      responseBody,
    );
  }
}

/** Current 28-day rolling percentiles + histogram densities. */
export async function queryRecord(
  input: CruxQueryInput,
): Promise<CruxQueryResult<CruxRecord>> {
  const result = await request<{ record?: CruxRecord }>(
    "records:queryRecord",
    buildRequestBody(input),
  );
  if (result.status === "no_data") return result;
  return result.data.record
    ? { status: "ok", record: result.data.record }
    : { status: "no_data" };
}

/** Weekly history (~40 collection periods) of the same metrics. */
export async function queryHistoryRecord(
  input: CruxQueryInput,
): Promise<CruxQueryResult<CruxHistoryRecord>> {
  const result = await request<{ record?: CruxHistoryRecord }>(
    "records:queryHistoryRecord",
    buildRequestBody(input),
  );
  if (result.status === "no_data") return result;
  return result.data.record
    ? { status: "ok", record: result.data.record }
    : { status: "no_data" };
}
