import { and, desc, eq, gt, inArray, notInArray, sql } from "drizzle-orm";
import { reverse } from "remeda";
import { db } from "@/db";
import { aiMatches, aiObservations, aiRuns } from "@/db/schema";

/** Finished runs from every trigger created after `since`, oldest first. */
export async function listTrendRuns(projectId: string, since: string) {
  // Keep the newest runs if the cap is ever reached.
  const runs = await db
    .select()
    .from(aiRuns)
    .where(
      and(
        eq(aiRuns.projectId, projectId),
        notInArray(aiRuns.status, ["queued", "running"]),
        gt(aiRuns.createdAt, since),
      ),
    )
    .orderBy(desc(aiRuns.createdAt), desc(aiRuns.id))
    .limit(400);
  return reverse(runs);
}
/** One row per answer with the own brand's identity and results. */
export async function getTrendObservations(runIds: string[]) {
  const rows = [];
  for (let offset = 0; offset < runIds.length; offset += 20) {
    rows.push(
      ...(await db
        .select({
          runId: aiObservations.runId,
          promptId: aiObservations.promptId,
          engine: aiObservations.engine,
          branded: aiObservations.branded,
          status: aiObservations.status,
          // Not the answer itself: trend reads hundreds of runs.
          hasAnswer:
            sql<number>`CASE WHEN ${aiObservations.answerMarkdown} IS NULL THEN 0 ELSE 1 END`.mapWith(
              Number,
            ),
          brandName: aiMatches.name,
          brandDomain: aiMatches.domain,
          mentioned: aiMatches.mentioned,
          cited: aiMatches.cited,
        })
        .from(aiObservations)
        .leftJoin(
          aiMatches,
          and(
            eq(aiMatches.observationId, aiObservations.id),
            eq(aiMatches.own, true),
          ),
        )
        .where(
          inArray(aiObservations.runId, runIds.slice(offset, offset + 20)),
        )),
    );
  }
  return rows;
}
