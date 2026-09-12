import type {
  GlobalTraceFilter,
  GlobalTraceOperation,
  GlobalTraceProviderCall,
  GlobalTraceStatus,
} from "@/shared/globalTraceTypes";

export function formatTraceDuration(durationMs?: number): string {
  if (typeof durationMs !== "number" || durationMs < 0) return "—";
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export function formatProviderBreakdown(
  breakdown?: Array<{ provider: string; count: number }>,
): string {
  if (!breakdown || breakdown.length === 0) return "No provider calls";
  return breakdown
    .map((item) => `${item.provider} ×${item.count}`)
    .join(" · ");
}

export function computeProviderBreakdown(
  providers?: GlobalTraceProviderCall[],
): Array<{ provider: string; count: number }> {
  if (!providers || providers.length === 0) return [];
  const map = new Map<string, number>();
  for (const call of providers) {
    const key = call.provider || "Unknown";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([provider, count]) => ({
    provider,
    count,
  }));
}

export function statusLabel(status: GlobalTraceStatus): string {
  switch (status) {
    case "running":
      return "Running…";
    case "success":
      return "SUCCESS";
    case "failed":
      return "FAILED";
    case "blocked":
      return "BLOCKED";
    default:
      return String(status).toUpperCase();
  }
}

export function filterOperations(
  operations: GlobalTraceOperation[],
  filter: GlobalTraceFilter,
): GlobalTraceOperation[] {
  switch (filter) {
    case "all":
      return operations;
    case "errors":
      return operations.filter(
        (op) =>
          op.status === "failed" ||
          (typeof op.httpStatus === "number" && op.httpStatus >= 400) ||
          op.errorClass ||
          op.errorMessage,
      );
    case "providers":
      return operations.filter(
        (op) => (op.providerCalls ?? 0) > 0 || (op.providers?.length ?? 0) > 0,
      );
    case "network":
      return operations.filter(
        (op) =>
          typeof op.httpStatus === "number" ||
          op.providers?.some((p) => typeof p.httpStatus === "number"),
      );
    case "billing":
      return operations.filter(
        (op) =>
          op.billing !== undefined ||
          op.budget !== undefined ||
          op.status === "blocked" ||
          op.cost !== undefined,
      );
    case "cache":
      return operations.filter(
        (op) =>
          op.cache === "HIT" ||
          op.cache === "MISS" ||
          op.cacheType !== undefined,
      );
    case "rank_tracking":
      return operations.filter((op) => op.feature === "rank_tracking");
    case "seo":
      return operations.filter(
        (op) =>
          op.feature === "keyword_research" ||
          op.feature === "domain_overview" ||
          op.feature === "backlinks" ||
          op.feature === "site_audit" ||
          op.feature === "search_console" ||
          op.feature === "saved_keywords" ||
          op.feature === "brand_lookup" ||
          op.feature === "prompt_explorer",
      );
    case "settings":
      return operations.filter((op) => op.feature === "settings");
    default:
      return operations;
  }
}
