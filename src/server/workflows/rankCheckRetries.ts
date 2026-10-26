import type { WorkflowStep } from "cloudflare:workers";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import type { RankCheckTaskInput } from "@/server/lib/dataforseo";
import { RETRY_ROUNDS } from "@/shared/rank-tracking";
import { pgStep } from "@/server/workflows/pgStep";
import {
  COLLECT_STEP_CONFIG,
  expandToTaskInputs,
  mapResultsToSnapshotRows,
  runQueuedTasks,
  type CheckContext,
  type RankCheckResultWithDevice,
} from "@/server/workflows/rankCheckPaths";

// ---------------------------------------------------------------------------
// Retries. A check that errors gets retried, and so does one that reads far
// worse than the keyword's known position: Google serves some scraped searches
// a fake results page that looks normal but leaves out sites that really rank.
// A keyword that never ranked has no known position, so its miss is rechecked
// up to RETRY_ROUNDS times on its first check, and on any manual check: a user
// running a check by hand wants another look at keywords stuck on not found.
// Retries are billed like any other check, and the best position found wins.
// ---------------------------------------------------------------------------

/** A result this many positions below the keyword's known rank is retried. */
const RETRY_DROP_POSITIONS = 10;

type RankCheckTrigger = "manual" | "scheduled";

interface RetryPair extends RankCheckTaskInput {
  /** Best position saved for this run; null if not found or never answered. */
  position: number | null;
  /** Whether any try got a results page back. */
  answered: boolean;
  /**
   * Best position the keyword has had: on either device in an earlier check,
   * or on its other device in this run. Null if it never ranked.
   */
  knownPosition: number | null;
  /**
   * No earlier check, or a manual check of a keyword that never ranked, so a
   * miss gets rechecked through all retry rounds.
   */
  recheckMiss: boolean;
}

function needsRetry(pair: RetryPair): boolean {
  if (!pair.answered) return true;
  if (pair.knownPosition === null) {
    return pair.recheckMiss && pair.position === null;
  }
  return (
    pair.position === null ||
    pair.position - pair.knownPosition >= RETRY_DROP_POSITIONS
  );
}

function key(keywordId: string, device: string) {
  return `${keywordId}:${device}`;
}

function otherDevice(device: "desktop" | "mobile") {
  return device === "desktop" ? "mobile" : "desktop";
}

/**
 * Find the keywords to retry: ones with a device the first check got no answer
 * for, that misses or falls far below the keyword's known position, or that
 * misses with no earlier check (or, on a manual check, after never ranking).
 * Both devices of each are returned, so a position a retry finds on one can
 * make the other's miss suspect.
 */
async function findRetryPairs(
  ctx: CheckContext,
  configId: string,
  trigger: RankCheckTrigger,
): Promise<RetryPair[]> {
  // The run is still active, so completed runs are all earlier checks.
  const [current, previous] = await Promise.all([
    RankTrackingRepository.getSnapshotsForRun(ctx.runId),
    RankTrackingRepository.getBestPositionsForKeywords(configId),
  ]);
  const previousPositions = new Map(
    previous.map((s) => [s.trackingKeywordId, s.position]),
  );
  const currentPositions = new Map(
    current.map((s) => [key(s.trackingKeywordId, s.device), s.position]),
  );

  const pairs = expandToTaskInputs(ctx.keywords, ctx.devices).map((task) => {
    const known = [
      previousPositions.get(task.keywordId),
      currentPositions.get(key(task.keywordId, otherDevice(task.device))),
    ].filter((position) => position != null);
    return {
      ...task,
      position: currentPositions.get(key(task.keywordId, task.device)) ?? null,
      answered: currentPositions.has(key(task.keywordId, task.device)),
      knownPosition: known.length > 0 ? Math.min(...known) : null,
      recheckMiss:
        trigger === "manual" || !previousPositions.has(task.keywordId),
    };
  });
  const retryKeywords = new Set(
    pairs.filter(needsRetry).map((pair) => pair.keywordId),
  );
  return pairs.filter((pair) => retryKeywords.has(pair.keywordId));
}

/**
 * Save any position that beats a pair's saved one, plus the first answer for
 * a keyword that never ranked, and return each pair updated.
 */
async function saveRetryResults(
  runId: string,
  pairs: RetryPair[],
  collected: RankCheckResultWithDevice[],
): Promise<RetryPair[]> {
  const results = new Map(
    collected.map((result) => [key(result.keywordId, result.device), result]),
  );
  const toSave: RankCheckResultWithDevice[] = [];
  const updated = pairs.map((pair) => {
    const result = results.get(key(pair.keywordId, pair.device));
    if (!result) return pair;
    const answered = { ...pair, answered: true };
    const isBetter =
      result.position !== null &&
      (pair.position === null || result.position < pair.position);
    const isFirstForNewKeyword = !pair.answered && pair.knownPosition === null;
    if (!isBetter && !isFirstForNewKeyword) return answered;
    toSave.push(result);
    return { ...answered, position: result.position };
  });
  if (toSave.length > 0) {
    await RankTrackingRepository.upsertSnapshots(
      mapResultsToSnapshotRows(runId, toSave),
    );
  }
  return updated;
}

/**
 * Add a position a retry just found to the known position of the keyword's
 * other device, as findRetryPairs does for the first check, so a miss on one
 * device isn't saved as not found while the other ranks in the same run.
 */
function withOtherDevicePositions(pairs: RetryPair[]): RetryPair[] {
  const positions = new Map(
    pairs.map((pair) => [key(pair.keywordId, pair.device), pair.position]),
  );
  return pairs.map((pair) => {
    const other = positions.get(key(pair.keywordId, otherDevice(pair.device)));
    if (other == null) return pair;
    return {
      ...pair,
      knownPosition: Math.min(pair.knownPosition ?? other, other),
    };
  });
}

/**
 * Retry each keyword/device pair whose check errored, reads far worse than
 * its known position, or missed on its first check ever or on a manual check
 * after never ranking, up to RETRY_ROUNDS more times through the task queue
 * (queue price, for manual runs too), stopping once a retry settles it. A
 * keyword that ranked before is never saved as not found: if no try found it,
 * its miss is removed, so it reads as not checked and keeps its previous
 * position.
 */
export async function retryRankChecks(
  step: WorkflowStep,
  ctx: CheckContext,
  configId: string,
  trigger: RankCheckTrigger,
): Promise<void> {
  let pairs = await pgStep(step, "find-retries", COLLECT_STEP_CONFIG, () =>
    findRetryPairs(ctx, configId, trigger),
  );

  for (let round = 0; round < RETRY_ROUNDS; round++) {
    const toRetry = pairs.filter(needsRetry);
    if (toRetry.length === 0) break;
    console.log(
      `[rank-check] ${ctx.runId} retry ${round + 1}: ${toRetry.length} check(s)`,
    );
    const label = `retry-${round}-`;
    const collected = await runQueuedTasks(step, ctx, toRetry, label);
    const updated = await pgStep(
      step,
      `${label}save`,
      COLLECT_STEP_CONFIG,
      () => saveRetryResults(ctx.runId, pairs, collected),
    );
    pairs = withOtherDevicePositions(updated);
  }

  const unconfirmed = pairs.filter(
    (pair) => pair.position === null && pair.knownPosition !== null,
  );
  if (unconfirmed.length === 0) return;
  await pgStep(step, "drop-unconfirmed-misses", COLLECT_STEP_CONFIG, () =>
    RankTrackingRepository.deleteNotFoundSnapshots(
      unconfirmed.map((pair) => ({
        runId: ctx.runId,
        trackingKeywordId: pair.keywordId,
        device: pair.device,
      })),
    ),
  );
}
