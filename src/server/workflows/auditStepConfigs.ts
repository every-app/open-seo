import type { WorkflowStepConfig } from "cloudflare:workers";

/**
 * Explicit step configs for the site-audit workflow.
 *
 * Without these, steps inherit the platform default (10-minute timeout,
 * multiple retries with backoff) — production audits against slow/hostile
 * sites burned ~65 minutes replaying a doomed step before erroring. Every
 * step now has a timeout sized to its real work and a small retry budget.
 */

/** Robots + sitemap walk (bounded at 300 docs / 15s per fetch internally). */
export const DISCOVERY_STEP: WorkflowStepConfig = {
  retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
  timeout: "4 minutes",
};

/** One crawl chunk: ~90s soft crawl deadline + persistence headroom. */
export const CRAWL_CHUNK_STEP: WorkflowStepConfig = {
  retries: { limit: 1, delay: "10 seconds", backoff: "constant" },
  timeout: "5 minutes",
};

/**
 * One Lighthouse URL (mobile + desktop). DataForSEO charges these calls, so a
 * Workflow replay must never issue them again after the step starts.
 */
export const LIGHTHOUSE_FETCH_STEP: WorkflowStepConfig = {
  retries: { limit: 0, delay: "1 second" },
  timeout: "5 minutes",
};

/** R2 + DB persistence is idempotent and safe to retry after the paid step. */
export const LIGHTHOUSE_PERSIST_STEP: WorkflowStepConfig = {
  retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
  timeout: "5 minutes",
};

/** Small DB-only steps (validate, select sample, finalize, mark-failed). */
export const DB_STEP: WorkflowStepConfig = {
  retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
  timeout: "2 minutes",
};

/** Cross-page checks read every page row of the audit — allow more time. */
export const MULTIPAGE_CHECKS_STEP: WorkflowStepConfig = {
  retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
  timeout: "5 minutes",
};
