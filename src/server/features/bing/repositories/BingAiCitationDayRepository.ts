import { asc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { bingAiCitationDays } from "@/db/schema";
import { executeInBatches } from "@/db/runBatch";

export type BingAiCitationDay = typeof bingAiCitationDays.$inferSelect;

async function listByProjectId(
  projectId: string,
): Promise<BingAiCitationDay[]> {
  return db
    .select()
    .from(bingAiCitationDays)
    .where(eq(bingAiCitationDays.projectId, projectId))
    .orderBy(asc(bingAiCitationDays.date));
}

/** Upsert one row per (project, date) — re-uploading an overlapping CSV
 *  just overwrites those days, same semantics as rapidapi_snapshots. */
async function bulkUpsert(
  rows: Array<{
    projectId: string;
    organizationId: string;
    date: string;
    citations: number;
    citedPages: number;
    uploadedByUserId: string;
  }>,
): Promise<void> {
  await executeInBatches(rows, (tx, row) =>
    tx
      .insert(bingAiCitationDays)
      .values({ id: crypto.randomUUID(), ...row })
      .onConflictDoUpdate({
        target: [bingAiCitationDays.projectId, bingAiCitationDays.date],
        set: {
          citations: row.citations,
          citedPages: row.citedPages,
          uploadedByUserId: row.uploadedByUserId,
          updatedAt: sql`(current_timestamp)`,
        },
      }),
  );
}

export const BingAiCitationDayRepository = {
  listByProjectId,
  bulkUpsert,
};
