import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { RankCheckMethod } from "@/shared/rank-tracking";

/**
 * Resolve which DataForSEO path a rank check run uses. Scheduled checks always
 * go through the cheaper standard task queue (~30% of live cost). Manual
 * checks default to the live endpoint for instant results, but can be opted
 * into the queue via RANK_CHECK_MANUAL_METHOD=queued — results then arrive
 * within ~5-15 minutes instead of seconds.
 */
export async function resolveRankCheckMethod(
  trigger: "manual" | "scheduled",
): Promise<RankCheckMethod> {
  if (trigger === "scheduled") return "queued";
  const manualMethod = await getOptionalEnvValue("RANK_CHECK_MANUAL_METHOD");
  return manualMethod === "queued" ? "queued" : "live";
}

/**
 * Whether queued runs may re-check stragglers via the live endpoint. On by
 * default; RANK_CHECK_QUEUE_LIVE_FALLBACK=off disables it — the run then
 * polls the queue for ~2 hours instead and reports anything still missing as
 * unchecked rather than paying live prices for it.
 */
export async function resolveQueueLiveFallback(): Promise<boolean> {
  return (
    (await getOptionalEnvValue("RANK_CHECK_QUEUE_LIVE_FALLBACK")) !== "off"
  );
}
