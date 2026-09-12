// Provider-call trace bridge for the SEO-data layer (Phase DT).
//
// The DataRouter is the one seam where every router-based provider/network
// execution happens (cache-first routing: internal ➔ free providers ➔
// DataForSEO). This module wraps those executions with trace emissions into
// the SAM trace bus — when one is active for the calling request. Outside a
// SAM turn every function here is a no-op, so the MCP server, dashboards, and
// onboarding agent pay nothing (no ambient scope ➔ no events ➔ no broadcast).
//
// Division of labor with the guarded runner (samGuardedToolExecute):
//   - traceProviderCall   ➔ provider_request / provider_success (identity +
//     duration of every real router-based provider execution)
//   - traceProviderError  ➔ ONLY failures the runner never sees classified:
//     budget guards that abort routing BEFORE the provider call. Thrown
//     provider errors are classified + emitted by the guarded runner's own
//     seam (single authority, no duplicate provider_error events).
//
// Import cycle safety: this module imports only the trace bus (which imports
// nothing from seo-data), so data-router ➔ trace ➔ samTraceBus is acyclic.

import { getSamTraceBus } from "@/server/features/sam/samTraceBus";
import { BudgetExceededError } from "./errors";

/**
 * Wrap one provider execution with provider_request/provider_success events.
 * The wrapper is transparent: same value, same errors, same timing.
 */
export async function traceProviderCall<T>(
  providerName: string,
  execute: () => Promise<T>,
): Promise<T> {
  const bus = getSamTraceBus();
  if (!bus.currentTurnId()) return execute();
  const startedAt = Date.now();
  bus.push({
    event: "provider_request",
    provider: providerName,
  });
  try {
    const data = await execute();
    bus.push({
      event: "provider_success",
      provider: providerName,
      durationMs: Date.now() - startedAt,
    });
    return data;
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      // The budget guard aborts routing before any provider call — the
      // guarded runner's classification seam can't see this, so emit here.
      bus.push({
        event: "provider_error",
        provider: providerName,
        httpStatus: 402,
        errorCode: "CREDITS_UNAVAILABLE",
      });
    } else if (
      typeof error === "object" &&
      error !== null &&
      !("providerErrorSource" in error)
    ) {
      // Attribute the failure to the provider that actually threw (the guarded
      // runner emits the classified provider_error without a provider field —
      // without this the panel would blame whichever provider ran last, e.g.
      // an internal snapshot miss masking a DataForSEO transient failure).
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- duck-typed trace metadata
      (error as { providerErrorSource?: string }).providerErrorSource =
        providerName;
    }
    throw error;
  }
}

/**
 * Record the router's cache decision (hit/miss) for the current tool.
 * (Kept as a named export even though the router calls it directly — the
 * trace vocabulary for cache decisions lives with the other bridge helpers.)
 */
export function traceCacheDecision(fromCache: boolean): void {
  const bus = getSamTraceBus();
  if (!bus.currentTurnId()) return;
  // The guarded runner already emits the dedup-cache decision; this is the
  // SEO-data cache (R2). Same event vocabulary, distinguished by provider
  // "cache" so the UI can show both layers without a second vocabulary.
  if (fromCache) {
    bus.push({ event: "cache_hit", provider: "cache", cacheHit: true });
  } else {
    bus.push({ event: "cache_miss", provider: "cache", cacheHit: false });
  }
}
