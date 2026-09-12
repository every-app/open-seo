/* eslint-disable @typescript-eslint/no-unsafe-type-assertion */
// SAM Debug Trace — formatting + wire-intake helpers (Phase DT).
//
// Split from samTraceReducer.ts to keep both files within lint budgets. Pure
// functions only: status lines, error labels, WS frame parsing, and snapshot
// equality. Unit-tested through samTraceReducer.test.ts (re-exported there).

import type { SamTraceFrame } from "@/shared/samToolTraceTypes";
import type { DataforseoCallDiagnostics } from "@/server/lib/dataforseo/shared";
import type {
  ProviderBreakdownEntry,
  TraceFilter,
  TraceToolView,
} from "./samTraceReducer";

/** Friendly display labels for canonical data-provider ids (unknown ids pass through). */
const PROVIDER_DISPLAY_LABELS: Record<string, string> = {
  dataforseo: "DataForSEO",
  gsc: "GSC",
  google_ads: "Google Ads",
  bing_webmaster: "Bing Webmaster",
  internal: "Internal",
  local_crawler: "Local Crawler",
  cache: "Cache",
};

/** Human display label for a canonical provider id (sanitized passthrough for unknowns). */
export function providerDisplayLabel(provider: string): string {
  return PROVIDER_DISPLAY_LABELS[provider] ?? provider;
}

/**
 * Compact one-line provider breakdown, first-seen order:
 * "Internal ×2 · DataForSEO ×2". Single provider → "GSC ×1". Empty → null
 * (zero-provider tools render no breakdown line).
 */
export function formatProviderBreakdown(
  breakdown: ProviderBreakdownEntry[],
): string | null {
  if (breakdown.length === 0) return null;
  return breakdown
    .map((entry) => `${providerDisplayLabel(entry.provider)} ×${entry.calls}`)
    .join(" · ");
}

/** Apply a compact filter to the reduced tool rows. */
export function filterTraceTools(
  tools: TraceToolView[],
  filter: TraceFilter,
): TraceToolView[] {
  switch (filter) {
    case "errors":
      return tools.filter((t) => t.finalOk === false);
    case "blocked":
      return tools.filter((t) => t.blockedRetries > 0);
    case "retries":
      return tools.filter((t) => t.retriesExecuted > 0 || t.retryScheduled);
    case "fallbacks":
      return tools.filter((t) => t.fallback !== null);
    case "all":
    default:
      return tools;
  }
}

/**
 * Narrow a trace event's metadata into a DataForSEO diagnostics record.
 * Returns undefined for non-dataforseo providers or events whose metadata
 * carries no diagnostics signature. The server emitted the record through
 * the scrubbing trace bus, so the shape is trusted at this boundary.
 */
export function diagnosticsOf(
  provider: string | undefined,
  metadata: Record<string, unknown> | undefined,
): DataforseoCallDiagnostics | undefined {
  if (provider !== "dataforseo" || !metadata) return undefined;
  if (
    !("endpoint" in metadata) &&
    !("transportError" in metadata) &&
    !("dataforseoStatus" in metadata) &&
    !("httpStatus" in metadata) &&
    !("responseShape" in metadata)
  ) {
    return undefined;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- trace metadata is the sanitized diagnostics record emitted by the DataForSEO seam
  return metadata as DataforseoCallDiagnostics;
}

/**
 * One-line transport/status label for a failed DataForSEO call:
 * "HTTP 503" when a response arrived, the classified transport category when
 * it did not ("DNS_LOOKUP_FAILED", "TIMEOUT", …), or "HTTP 200 (app 40000)"
 * for an HTTP-200 application-level error. Null when none of these apply.
 */
export function dataforseoFailureLabel(
  diagnostics: DataforseoCallDiagnostics | undefined,
): string | null {
  if (!diagnostics) return null;
  if (diagnostics.transportError) return diagnostics.transportError;
  const http = diagnostics.httpStatus;
  const app = diagnostics.dataforseoStatus;
  if (typeof http === "number") {
    if (http === 200 && typeof app === "number" && app !== 20000) {
      return `HTTP 200 · app ${app}`;
    }
    if (http !== 200) return `HTTP ${http}`;
  }
  if (typeof app === "number" && app !== 20000) return `app ${app}`;
  return null;
}

/** "DataForSEO → HTTP 402" / "dataforseo → DNS_LOOKUP_FAILED" status line. */
export function providerStatusLine(tool: TraceToolView): string | null {
  if (tool.dedupCache === "hit") return "Cache: HIT (dedup)";
  if (tool.lastProviderError) {
    const { provider, httpStatus, errorCode, diagnostics } =
      tool.lastProviderError;
    // Prefer the exact low-level cause from DataForSEO diagnostics (HTTP
    // status, or the transport category for network failures), then the
    // HTTP status, then the normalized error class — one failure
    // identifier, never both (no duplicated labels).
    const status =
      dataforseoFailureLabel(diagnostics) ??
      (httpStatus != null ? `HTTP ${httpStatus}` : null) ??
      errorClassLabel(errorCode);
    return `${providerDisplayLabel(provider)} → ${status}`;
  }
  if (tool.seoCache && tool.seoCache.hits > 0 && tool.providerCalls === 0) {
    return "Cache: HIT";
  }
  if (tool.lastProvider) {
    return `${providerDisplayLabel(tool.lastProvider)} → ${tool.durationMs ?? 0}ms`;
  }
  return null;
}

/** Human label for a normalized error class code. */
export function errorClassLabel(errorCode: string | undefined): string {
  switch (errorCode) {
    case "CREDITS_UNAVAILABLE":
      return "CREDITS_UNAVAILABLE";
    case "DATAFORSEO_ACCESS_PAUSED":
      return "DATAFORSEO_ACCESS_PAUSED";
    case "RATE_LIMITED":
      return "RATE_LIMITED";
    case "TRANSIENT_UPSTREAM":
      return "TRANSIENT_UPSTREAM";
    case "PERMANENT_UNAVAILABLE":
      return "AUTH/CONFIG REQUIRED";
    case "TOOL_INPUT_INVALID":
      return "TOOL_INPUT_INVALID";
    default:
      return errorCode ?? "UNKNOWN";
  }
}

/**
 * Curated one-line reason for a normalized failure class, shown in the
 * expanded tool row. Only classes with a provider-specific explanation
 * return one — every other class renders no Reason line (existing UI).
 */
export function failureReasonFor(errorCode: string | undefined): string | null {
  switch (errorCode) {
    case "DATAFORSEO_ACCESS_PAUSED":
      return "DataForSEO temporarily paused API access due to unusual activity.";
    default:
      return null;
  }
}

/** Parse one incoming WS frame text into a SamTraceFrame (null when not one). */
export function parseTraceFrame(raw: string): SamTraceFrame | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      (parsed as { type?: unknown }).type === "sam_trace"
    ) {
      const frame = parsed as SamTraceFrame;
      if (Array.isArray(frame.events) && frame.ai) return frame;
    }
  } catch {
    // Not JSON / not a trace frame — the chat protocol carries many frames.
  }
  return null;
}

/** Events list equality (cheap: length + last sequence). */
export function sameEvents(
  a: unknown[] | undefined,
  b: unknown[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  const lastA = a[a.length - 1] as { sequence?: number } | undefined;
  const lastB = b[b.length - 1] as { sequence?: number } | undefined;
  return lastA?.sequence === lastB?.sequence;
}
