import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  localGridRankings,
  localGridResults,
  localGridRunPoints,
} from "@/db/schema";

async function getRunRankings(runId: string) {
  return db
    .select({
      trackingKeywordId: localGridResults.trackingKeywordId,
      rank: localGridRankings.rank,
      placeId: localGridRankings.placeId,
      cid: localGridRankings.cid,
      featureId: localGridRankings.featureId,
      name: localGridRankings.name,
      rating: localGridRankings.rating,
      reviewCount: localGridRankings.reviewCount,
    })
    .from(localGridRankings)
    .innerJoin(
      localGridResults,
      eq(localGridRankings.resultId, localGridResults.id),
    )
    .innerJoin(
      localGridRunPoints,
      eq(localGridResults.runPointId, localGridRunPoints.id),
    )
    .where(eq(localGridRunPoints.runId, runId));
}

export const LocalGridRankingRepository = { getRunRankings };
