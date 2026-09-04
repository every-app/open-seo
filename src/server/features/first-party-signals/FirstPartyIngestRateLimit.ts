export const FIRST_PARTY_INGEST_RETRY_AFTER_SECONDS = 60;

const GLOBAL_RECEIVER_KEY = "aggregate-receiver";
const INVALID_CLAIMED_SOURCE_KEY = "invalid-or-missing-source";

type RateLimitBinding = {
  limit: (input: { key: string }) => Promise<{ success: boolean }>;
};

type FirstPartyIngestRateLimitEnv = {
  FIRST_PARTY_INGEST_EDGE_LIMITS_REQUIRED?: string;
  FIRST_PARTY_INGEST_GLOBAL_RATE_LIMIT?: RateLimitBinding;
  FIRST_PARTY_INGEST_CLAIMED_SOURCE_RATE_LIMIT?: RateLimitBinding;
  FIRST_PARTY_INGEST_RATE_LIMIT?: RateLimitBinding;
};

export type FirstPartyIngestRateLimitDecision =
  | "allowed"
  | "rate_limited"
  | "unavailable";

function bindingsAreExpected(env: FirstPartyIngestRateLimitEnv): boolean {
  return (
    env.FIRST_PARTY_INGEST_EDGE_LIMITS_REQUIRED === "true" ||
    Boolean(env.FIRST_PARTY_INGEST_GLOBAL_RATE_LIMIT) ||
    Boolean(env.FIRST_PARTY_INGEST_CLAIMED_SOURCE_RATE_LIMIT) ||
    Boolean(env.FIRST_PARTY_INGEST_RATE_LIMIT)
  );
}

function hasCompleteBindingSet(env: FirstPartyIngestRateLimitEnv): boolean {
  return Boolean(
    env.FIRST_PARTY_INGEST_GLOBAL_RATE_LIMIT &&
    env.FIRST_PARTY_INGEST_CLAIMED_SOURCE_RATE_LIMIT &&
    env.FIRST_PARTY_INGEST_RATE_LIMIT,
  );
}

async function applyLimit(
  binding: RateLimitBinding,
  key: string,
): Promise<FirstPartyIngestRateLimitDecision> {
  try {
    return (await binding.limit({ key })).success ? "allowed" : "rate_limited";
  } catch {
    // The receiver is public by design. A configured edge guard becoming
    // unavailable must not silently turn an outage into an unbounded path.
    return "unavailable";
  }
}

/**
 * Applies two non-identifying edge guards before body reads, database access,
 * secret decryption, or HMAC work. The constant key bounds random UUID sprays;
 * the opaque claimed-source key bounds repeated abuse without IP persistence.
 */
export async function enforceFirstPartyPreAuthRateLimits(
  env: FirstPartyIngestRateLimitEnv,
  claimedSourceId: string | null,
): Promise<FirstPartyIngestRateLimitDecision> {
  if (!bindingsAreExpected(env)) return "allowed";
  const globalLimit = env.FIRST_PARTY_INGEST_GLOBAL_RATE_LIMIT;
  const claimedSourceLimit = env.FIRST_PARTY_INGEST_CLAIMED_SOURCE_RATE_LIMIT;
  if (!hasCompleteBindingSet(env) || !globalLimit || !claimedSourceLimit) {
    return "unavailable";
  }

  const globalDecision = await applyLimit(globalLimit, GLOBAL_RECEIVER_KEY);
  if (globalDecision !== "allowed") return globalDecision;
  return applyLimit(
    claimedSourceLimit,
    claimedSourceId ?? INVALID_CLAIMED_SOURCE_KEY,
  );
}

/** Preserves the stricter authenticated per-source limiter after HMAC. */
export async function enforceFirstPartyAuthenticatedRateLimit(
  env: FirstPartyIngestRateLimitEnv,
  sourceId: string,
): Promise<FirstPartyIngestRateLimitDecision> {
  if (!bindingsAreExpected(env)) return "allowed";
  const authenticatedLimit = env.FIRST_PARTY_INGEST_RATE_LIMIT;
  if (!hasCompleteBindingSet(env) || !authenticatedLimit) {
    return "unavailable";
  }
  return applyLimit(authenticatedLimit, sourceId);
}
