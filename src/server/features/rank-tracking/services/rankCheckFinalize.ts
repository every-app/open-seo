import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";

type RunRow = NonNullable<
  Awaited<ReturnType<typeof RankTrackingRepository.getRunById>>
>;

/**
 * Flip an in-flight rank check to completed from already-written snapshots.
 *
 * Scheduled DFS checks write snapshots incrementally, then a separate finalize
 * step flips status. If that step dies (telemetry hang, isolate kill, workflow
 * retention) the API hides positions because results only read completed runs.
 * Callers use this to finish the status flip without re-probing DataForSEO.
 *
 * When `requireFullCoverage` is true (watchdog / stale reclaim), returns null
 * unless every expected keyword already has a snapshot — so a still-collecting
 * run is left alone. The workflow finalize path passes false and always closes
 * the run (matching prior finalize behavior, including partial/error cases).
 */
export async function completeRankCheckRunFromSnapshots(input: {
  run: RunRow;
  batchError?: string | null;
  requireFullCoverage?: boolean;
}): Promise<{
  keywordsChecked: number;
  keywordsTotal: number;
  completedAt: string;
} | null> {
  const { run } = input;
  if (run.status === "completed" || run.status === "failed") {
    return null;
  }

  const snapshots = await RankTrackingRepository.getSnapshotsForRun(run.id);
  const keywordsChecked = new Set(snapshots.map((s) => s.trackingKeywordId))
    .size;
  const keywordsTotal = run.keywordsTotal || keywordsChecked;

  if (input.requireFullCoverage) {
    if (keywordsChecked === 0 || keywordsChecked < keywordsTotal) {
      return null;
    }
  }

  const completedAt = new Date().toISOString();
  const incompleteCount = Math.max(keywordsTotal - keywordsChecked, 0);

  let errorMessage: string | undefined;
  if (input.batchError) {
    errorMessage = `Completed ${keywordsChecked} of ${keywordsTotal} keyword(s). Error: ${input.batchError}`;
  } else if (incompleteCount > 0) {
    errorMessage = `${incompleteCount} keyword(s) could not be checked`;
  }

  // Flipping status away from 'pending'/'running' releases the partial-index
  // slot for the next run. Do this before any telemetry.
  await RankTrackingRepository.updateRun(run.id, {
    status: "completed",
    keywordsChecked,
    completedAt,
    ...(errorMessage ? { errorMessage } : {}),
  });

  // Clear any previous skip reason on success.
  // Note: nextCheckAt is NOT set here — the cron handler advances it eagerly
  // before starting the workflow to prevent retry storms.
  await RankTrackingRepository.updateConfig(run.configId, run.projectId, {
    lastCheckedAt: completedAt,
    lastSkipReason: null,
  });

  return { keywordsChecked, keywordsTotal, completedAt };
}
