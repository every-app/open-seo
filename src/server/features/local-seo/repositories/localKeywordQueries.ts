import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import { localRankKeywords } from "@/db/schema";

export async function getKeywords(trackerId: string, includeArchived = false) {
  return db
    .select()
    .from(localRankKeywords)
    .where(
      and(
        eq(localRankKeywords.trackerId, trackerId),
        includeArchived ? undefined : isNull(localRankKeywords.archivedAt),
      ),
    )
    .orderBy(asc(localRankKeywords.keyword));
}

export async function saveKeywords(
  trackerId: string,
  keywords: (typeof localRankKeywords.$inferInsert)[],
  removedIds: string[],
) {
  await runBatch((tx) => [
    ...keywords.map((keyword) =>
      tx
        .insert(localRankKeywords)
        .values(keyword)
        .onConflictDoUpdate({
          target: [localRankKeywords.trackerId, localRankKeywords.keyword],
          set: { archivedAt: null },
        }),
    ),
    ...(removedIds.length
      ? [
          tx
            .update(localRankKeywords)
            .set({ archivedAt: new Date().toISOString() })
            .where(
              and(
                eq(localRankKeywords.trackerId, trackerId),
                inArray(localRankKeywords.id, removedIds),
              ),
            ),
        ]
      : []),
  ]);
}
