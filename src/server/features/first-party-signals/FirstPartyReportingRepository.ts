import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  firstPartySignalBatches,
  firstPartySignalDailyAggregates,
  firstPartySignalSources,
} from "@/db/schema";

const aggregateSelection = {
  searchStarted: sql<number>`coalesce(sum(${firstPartySignalDailyAggregates.searchStarted}), 0)`,
  searchCompleted: sql<number>`coalesce(sum(${firstPartySignalDailyAggregates.searchCompleted}), 0)`,
  searchNoResults: sql<number>`coalesce(sum(${firstPartySignalDailyAggregates.searchNoResults}), 0)`,
  registrationsCompleted: sql<number>`coalesce(sum(${firstPartySignalDailyAggregates.registrationsCompleted}), 0)`,
  checkoutStarted: sql<number>`coalesce(sum(${firstPartySignalDailyAggregates.checkoutStarted}), 0)`,
  paymentsCompleted: sql<number>`coalesce(sum(${firstPartySignalDailyAggregates.paymentsCompleted}), 0)`,
};

function currentAggregateWhere(
  projectId: string,
  startDate: string,
  endDate: string,
) {
  return and(
    eq(firstPartySignalSources.projectId, projectId),
    eq(firstPartySignalBatches.status, "complete"),
    sql`${firstPartySignalBatches.snapshotDate} >= ${startDate}`,
    sql`${firstPartySignalBatches.snapshotDate} <= ${endDate}`,
  );
}

async function getFunnel(
  projectId: string,
  startDate: string,
  endDate: string,
) {
  const [row] = await db
    .select({
      ...aggregateSelection,
      observedAt: sql<
        string | null
      >`max(${firstPartySignalBatches.snapshotDate})`,
      receivedAt: sql<
        string | null
      >`max(${firstPartySignalDailyAggregates.receivedAt})`,
    })
    .from(firstPartySignalDailyAggregates)
    .innerJoin(
      firstPartySignalBatches,
      and(
        eq(
          firstPartySignalBatches.id,
          firstPartySignalDailyAggregates.batchReceiptId,
        ),
        eq(
          firstPartySignalBatches.processingLeaseId,
          firstPartySignalDailyAggregates.processingAttemptId,
        ),
      ),
    )
    .innerJoin(
      firstPartySignalSources,
      eq(firstPartySignalSources.id, firstPartySignalBatches.sourceId),
    )
    .where(currentAggregateWhere(projectId, startDate, endDate));
  return row ?? null;
}

async function getLandingConversions(
  projectId: string,
  startDate: string,
  endDate: string,
  limit: number,
) {
  return db
    .select({
      landingPath: firstPartySignalDailyAggregates.landingPath,
      ...aggregateSelection,
    })
    .from(firstPartySignalDailyAggregates)
    .innerJoin(
      firstPartySignalBatches,
      and(
        eq(
          firstPartySignalBatches.id,
          firstPartySignalDailyAggregates.batchReceiptId,
        ),
        eq(
          firstPartySignalBatches.processingLeaseId,
          firstPartySignalDailyAggregates.processingAttemptId,
        ),
      ),
    )
    .innerJoin(
      firstPartySignalSources,
      eq(firstPartySignalSources.id, firstPartySignalBatches.sourceId),
    )
    .where(currentAggregateWhere(projectId, startDate, endDate))
    .groupBy(firstPartySignalDailyAggregates.landingPath)
    .orderBy(
      desc(aggregateSelection.paymentsCompleted),
      desc(aggregateSelection.searchStarted),
    )
    .limit(limit);
}

export const FirstPartyReportingRepository = {
  getFunnel,
  getLandingConversions,
};
