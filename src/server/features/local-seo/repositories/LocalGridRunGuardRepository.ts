import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { localGridRuns } from "@/db/schema";

// Age is checked in the service. Matching the exact observed timestamp keeps
// this compare-and-set safe across SQLite and Postgres text timestamp formats.
async function failStalePendingRun(input: {
  runId: string;
  startedAt: string;
  reason: string;
}) {
  const updated = await db
    .update(localGridRuns)
    .set({
      status: "failed",
      errorMessage: input.reason.slice(0, 1_000),
      completedAt: new Date().toISOString(),
    })
    .where(
      and(
        eq(localGridRuns.id, input.runId),
        eq(localGridRuns.status, "pending"),
        eq(localGridRuns.startedAt, input.startedAt),
      ),
    )
    .returning({ id: localGridRuns.id });
  return updated.length > 0;
}

export const LocalGridRunGuardRepository = { failStalePendingRun };
