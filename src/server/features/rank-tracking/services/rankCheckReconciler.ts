import { and, asc, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { rankCheckRuns } from "@/db/schema";
import { completeRankCheckRunFromSnapshots } from "@/server/features/rank-tracking/services/rankCheckFinalize";
import { failRunIfActive } from "@/server/features/rank-tracking/services/rankCheckRunGuards";

/**
 * Snapshots for a finished DFS collect are usually present minutes before the
 * finalize step runs. Give the live workflow that window, then complete from
 * DB state so positions stop staying invisible behind status=running.
 */
const SNAPSHOT_FINALIZE_GRACE_MS = 3 * 60 * 1000;

/** In-flight runs older than this with no complete snapshots get failed. */
const STALE_INCOMPLETE_MS = 25 * 60 * 1000;

const WATCHDOG_BATCH_LIMIT = 100;

/**
 * Cron watchdog: finish (or fail) rank_check_runs stuck in pending/running
 * after their workflow should have finalized.
 */
export async function reconcileStuckRankCheckRuns() {
  const snapshotGraceCutoff = new Date(
    Date.now() - SNAPSHOT_FINALIZE_GRACE_MS,
  ).toISOString();
  const incompleteCutoff = new Date(
    Date.now() - STALE_INCOMPLETE_MS,
  ).toISOString();

  const stuck = await db
    .select()
    .from(rankCheckRuns)
    .where(
      and(
        inArray(rankCheckRuns.status, ["pending", "running"]),
        lt(rankCheckRuns.startedAt, snapshotGraceCutoff),
      ),
    )
    .orderBy(asc(rankCheckRuns.startedAt))
    .limit(WATCHDOG_BATCH_LIMIT);

  for (const run of stuck) {
    try {
      const completed = await completeRankCheckRunFromSnapshots({
        run,
        requireFullCoverage: true,
      });
      if (completed) {
        console.log(
          `[rank-check] watchdog completed run ${run.id} from snapshots (${completed.keywordsChecked}/${completed.keywordsTotal})`,
        );
        continue;
      }

      if (run.startedAt < incompleteCutoff) {
        await failRunIfActive(
          run.id,
          "Rank check timed out before finalizing",
          run,
        );
        console.log(
          `[rank-check] watchdog failed stale incomplete run ${run.id}`,
        );
      }
    } catch (error) {
      console.error(
        `[rank-check] watchdog failed to reconcile ${run.id}:`,
        error,
      );
    }
  }
}
