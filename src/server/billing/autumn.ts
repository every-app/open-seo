import { Autumn } from "autumn-js";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";

export const autumn = new Autumn({
  secretKey: () => getRequiredEnvValue("AUTUMN_SECRET_KEY"),
  // Retries 429/500/502/503/504 (per-operation retryCodes) plus connection
  // errors. Cloudflare 52x statuses are not in the SDK's retry list, so those
  // still surface immediately.
  //
  // These reads/gates (customers.getOrCreate, check) sit on the request hot
  // path, so keep the total retry window short: when Autumn is rate-limiting or
  // slow, an 8s backoff window held the isolate open for seconds on every
  // request and cascaded into region-wide congestion (incident 2026-07-06).
  // Fail fast instead — a caller that can't gate surfaces an error rather than
  // hanging.
  retryConfig: {
    strategy: "backoff",
    backoff: {
      initialInterval: 250,
      maxInterval: 1000,
      exponent: 1.5,
      maxElapsedTime: 2500,
    },
    retryConnectionErrors: true,
  },
});

// track() has no idempotency key, so replaying a deduction Autumn already
// processed (5xx after a successful write, dropped connection) would
// double-charge. Retry only 429s, which are rejected before processing.
export const AUTUMN_TRACK_RETRY_OPTIONS: Parameters<Autumn["track"]>[1] = {
  retryCodes: ["429"],
  retries: {
    strategy: "backoff",
    backoff: {
      initialInterval: 250,
      maxInterval: 2000,
      exponent: 1.5,
      maxElapsedTime: 8000,
    },
    retryConnectionErrors: false,
  },
};
