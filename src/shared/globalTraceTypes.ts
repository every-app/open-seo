// Normalized Global OpenSEO Operation Trace types (Phase — Global Debug Trace).
//
// Shared between client and server for application operations (non-SAM).
// Covers Rank Tracking, Keyword Research, Domain Overview, Backlinks, Site Audit,
// Search Console, Saved Keywords, Settings, and Data Provider diagnostics.
//
// SECURITY INVARIANT:
// Trace events carry only sanitized, non-sensitive metadata:
// safe endpoints, HTTP status codes, provider task statuses, counts, durations,
// keyword IDs, and safe error classes.
// NEVER credentials, passwords, API keys, Basic/Bearer auth tokens, cookies,
// or raw authorization headers.

export type GlobalTraceFeature =
  | "rank_tracking"
  | "keyword_research"
  | "domain_overview"
  | "backlinks"
  | "site_audit"
  | "search_console"
  | "saved_keywords"
  | "brand_lookup"
  | "prompt_explorer"
  | "settings";

export type GlobalTraceStatus = "running" | "success" | "failed" | "blocked";

export type GlobalTraceFilter =
  | "all"
  | "errors"
  | "providers"
  | "network"
  | "billing"
  | "cache"
  | "rank_tracking"
  | "seo"
  | "settings";

export type GlobalTraceProviderCall = {
  provider: string; // e.g. "DataForSEO", "GSC", "Internal", "Cache"
  endpoint?: string; // safe path only (e.g. "v3/dataforseo_labs/google/domain_rank_overview/live")
  httpStatus?: number | null;
  taskStatus?: number | null; // e.g. 20000, 40200, 40201
  statusMessage?: string;
  transport?: "HTTP" | "DNS" | "TIMEOUT" | "TLS" | "CONNECTION";
  durationMs?: number;
  billing?: "Paid" | "Free";
  metered?: boolean;
  budgetGuard?: "PASS" | "BLOCKED";
  cost?: number | string | null;
  tasksCreated?: boolean;
  tasksCount?: number;
  resultCount?: number;
  itemsCount?: number;
  tasksError?: number;
};

export type GlobalTraceKeywordChild = {
  keywordId: string;
  keyword?: string; // safe display label
  status: "success" | "failed" | "blocked" | "no_result";
  provider?: string;
  durationMs?: number;
  positionBefore?: number | null;
  positionAfter?: number | null;
  httpStatus?: number | null;
  taskStatus?: number | null;
  cost?: number | string | null;
  error?: string;
};

export type GlobalTraceRetryDetail = {
  attempt: number;
  provider: string;
  httpStatus?: number | null;
  taskStatus?: number | null;
  durationMs?: number;
  error?: string;
};

export type GlobalTraceOperation = {
  traceId: string;
  operationId: string;
  parentOperationId?: string;
  sessionId?: string;
  projectId?: string;
  organizationId?: string;
  feature: GlobalTraceFeature;
  operation: string; // e.g. "rank_tracking.check_selected", "settings.dataforseo.connection_test"
  source: string; // e.g. "Rank Tracking page", "Settings", "Keyword Research page"
  status: GlobalTraceStatus;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;

  // Selection scope (Mandatory for rank tracking selected checks)
  scope?: "selected" | "all";
  selectedCount?: number;
  validatedCount?: number;
  rankChecksStarted?: number;
  rankChecksSucceeded?: number;
  rankChecksFailed?: number;
  rankChecksSkipped?: number;
  selectedKeywordIds?: string[];

  // Provider summary & breakdown
  provider?: string; // e.g. "DataForSEO ×4"
  providerCalls?: number;
  providerBreakdown?: Array<{ provider: string; count: number }>;
  providers?: GlobalTraceProviderCall[];

  // Network & Transport
  httpStatus?: number | null;
  errorClass?: string;
  errorMessage?: string;

  // Cache
  cache?: "HIT" | "MISS" | "Not applicable";
  cacheType?: string; // "R2", "dedup", "internal snapshot", etc.

  // Billing & Budget
  billing?: "Paid" | "Free";
  metered?: boolean;
  budget?: "PASS" | "BLOCKED";
  cost?: string | number | null;
  blockedReason?: string;

  // Retry
  retry?: {
    attempted: boolean;
    count: number;
    details?: GlobalTraceRetryDetail[];
  };

  counters?: Record<string, number>;
  metadata?: Record<string, unknown>;
  children?: GlobalTraceKeywordChild[];
};

/**
 * Scrub a string of anything that looks like credential material.
 * Enforces defense-in-depth sanitization: API keys, passwords, Basic/Bearer auth, cookies.
 */
export function scrubGlobalTraceText(value: string): string {
  return value
    .replace(/\b(?:Bearer|Basic)\s+[\w./+=-]+/gi, "[redacted]")
    .replace(/\bsk-[\w-]+/g, "[redacted]")
    .replace(
      /\b(?:authorization|api[-_]?key|password|secret|token|credentials|cookie|session)\b["'`]?\s*[:=]\s*["'`]?[^,}\s"';]+["'`]?/gi,
      "[redacted]",
    )
    .replace(/\b(?:session|cookie)=[\w-]+/gi, "[redacted]")
    .replace(/login\s*[:=]\s*["'`]?[^,}\s"']+["'`]?/gi, "[redacted]")
    .replace(/password\s*[:=]\s*["'`]?[^,}\s"']+["'`]?/gi, "[redacted]");
}
