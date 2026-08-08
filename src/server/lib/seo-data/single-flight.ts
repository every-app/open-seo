/**
 * Request coalescing / single-flight: prevents duplicate concurrent requests
 * for the same cache key from making multiple external API calls.
 *
 * If request A is in-flight for key K, requests B and C for the same key will
 * await A's promise rather than issuing their own provider calls.
 *
 * Based on the existing `inflightFills` pattern in `serp-locations.ts`.
 */
const inflight = new Map<string, Promise<unknown>>();

/**
 * Deduplicate concurrent calls for the same key. The first caller executes
 * the factory; subsequent callers with the same key await the same promise.
 */
export function singleFlight<T>(
  key: string,
  factory: () => Promise<T>,
): Promise<T> {
  const existing = inflight.get(key);
  if (existing) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- coalesced promise is the same factory
    return existing as Promise<T>;
  }

  const promise = factory().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

/**
 * Test-only: clear the inflight map. In production, entries self-clean on
 * settle; this is only needed between test cases.
 */
export function clearSingleFlight(): void {
  inflight.clear();
}