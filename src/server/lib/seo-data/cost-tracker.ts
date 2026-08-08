import { getOptionalEnvValue } from "@/server/lib/runtime-env";

/**
 * Cost-control and observability counters for SEO data requests. Tracks
 * provider usage across the lifetime of the isolate, with optional persistent
 * budget guards (daily/monthly) backed by KV.
 *
 * Never logs: API passwords, API keys, OAuth secrets, authorization headers,
 * refresh tokens. Only logs provider name, data type, cache status, and
 * duration.
 */

export type CostCounters = {
  dataforseoCalls: number;
  cacheHits: number;
  cacheMisses: number;
  freeProviderCalls: number;
  fallbackCalls: number;
  estimatedDataforseoCostUsd: number;
};

const counters: CostCounters = {
  dataforseoCalls: 0,
  cacheHits: 0,
  cacheMisses: 0,
  freeProviderCalls: 0,
  fallbackCalls: 0,
  estimatedDataforseoCostUsd: 0,
};

export function getCostCounters(): CostCounters {
  return { ...counters };
}

export function resetCostCounters(): void {
  counters.dataforseoCalls = 0;
  counters.cacheHits = 0;
  counters.cacheMisses = 0;
  counters.freeProviderCalls = 0;
  counters.fallbackCalls = 0;
  counters.estimatedDataforseoCostUsd = 0;
}

export function recordCacheHit(): void {
  counters.cacheHits += 1;
}

export function recordCacheMiss(): void {
  counters.cacheMisses += 1;
}

export function recordFreeProviderCall(provider: string): void {
  counters.freeProviderCalls += 1;
  counters.fallbackCalls += 0;
  void provider;
}

export function recordDataforseoCall(
  costUsd: number,
  fallbackReason?: string,
): void {
  counters.dataforseoCalls += 1;
  counters.fallbackCalls += fallbackReason ? 1 : 0;
  counters.estimatedDataforseoCostUsd += costUsd;
  void fallbackReason;
}

/**
 * Structured log entry for a data request. Never includes secrets.
 */
export type RequestLogEntry = {
  requestId: string;
  dataType: string;
  provider: string;
  cacheStatus: "hit" | "miss";
  fallback: boolean;
  fallbackReason?: string;
  durationMs: number;
  success: boolean;
};

export function logRequest(entry: RequestLogEntry): void {
  const parts = [
    entry.dataType,
    `cache=${entry.cacheStatus.toUpperCase()}`,
    `provider=${entry.provider}`,
    `fallback=${entry.fallback}`,
    entry.fallbackReason ? `reason=${entry.fallbackReason}` : null,
    `duration=${entry.durationMs}ms`,
    `success=${entry.success}`,
  ].filter(Boolean);
  console.log(`[seo-data] ${parts.join(" ")}`);
}

/**
 * Budget guard for DataForSEO calls. Reads daily/monthly limits from env.
 * Returns whether a DataForSEO call is permitted given current spend.
 *
 * Note: persistent spend tracking across isolate restarts requires KV. In the
 * Workers runtime, each isolate has its own in-memory counters, so the budget
 * guard is best-effort within an isolate. For hosted mode, the existing
 * `assertUsageCreditsAvailable` in the metered client is the authoritative
 * budget guard. This is an additional layer for self-hosted mode.
 */
export type BudgetConfig = {
  dailyLimitUsd: number | null;
  monthlyLimitUsdUsd: number | null;
};

let cachedBudget: BudgetConfig | null = null;

async function loadBudgetConfig(): Promise<BudgetConfig> {
  if (cachedBudget) return cachedBudget;

  const daily = await getOptionalEnvValue("DATAFORSEO_DAILY_BUDGET");
  const monthly = await getOptionalEnvValue("DATAFORSEO_MONTHLY_BUDGET");

  cachedBudget = {
    dailyLimitUsd: daily ? Number.parseFloat(daily) || null : null,
    monthlyLimitUsdUsd: monthly ? Number.parseFloat(monthly) || null : null,
  };
  return cachedBudget;
}

export async function isDataforseoBudgetAvailable(): Promise<boolean> {
  const config = await loadBudgetConfig();
  if (config.dailyLimitUsd !== null) {
    if (counters.estimatedDataforseoCostUsd >= config.dailyLimitUsd) {
      return false;
    }
  }
  if (config.monthlyLimitUsdUsd !== null) {
    if (counters.estimatedDataforseoCostUsd >= config.monthlyLimitUsdUsd) {
      return false;
    }
  }
  return true;
}

export async function getDataforseoBudgetConfig(): Promise<BudgetConfig> {
  return loadBudgetConfig();
}

export function resetBudgetConfigCache(): void {
  cachedBudget = null;
}