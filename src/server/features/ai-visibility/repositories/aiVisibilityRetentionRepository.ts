import { and, asc, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { aiRuns } from "@/db/schema";

/** Deletes up to 80 finished runs older than 13 months, with their answers. */
export async function pruneAiHistory(now: Date) {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - 13);
  const runs = await db
    .select({ id: aiRuns.id })
    .from(aiRuns)
    .where(
      and(
        lt(aiRuns.createdAt, cutoff.toISOString()),
        inArray(aiRuns.status, ["completed", "partial", "failed"]),
      ),
    )
    .orderBy(asc(aiRuns.createdAt))
    .limit(80);
  if (runs.length)
    await db.delete(aiRuns).where(
      inArray(
        aiRuns.id,
        runs.map((r) => r.id),
      ),
    );
}
