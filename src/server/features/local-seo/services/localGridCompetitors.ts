import type {
  LocalGridCompetitorSummary,
  LocalGridResultCell,
} from "@/types/schemas/local-seo";
import type { LocalGridRankingRepository } from "../repositories/LocalGridRankingRepository";

interface TargetBusiness {
  name: string;
  placeId: string | null;
  cid: string | null;
  featureId: string | null;
}

interface CompetitorGroup {
  trackingKeywordId: string;
  name: string;
  rankTotal: number;
  appearances: number;
  rating: number | null;
  reviewCount: number | null;
}

export function summarizeLocalGridCompetitors(input: {
  rankings: Awaited<
    ReturnType<typeof LocalGridRankingRepository.getRunRankings>
  >;
  cells: LocalGridResultCell[];
  business: TargetBusiness;
  keywordIds: Iterable<string>;
}): LocalGridCompetitorSummary[] {
  const completedByKeyword = new Map<string, number>();
  for (const cell of input.cells) {
    if (cell.status !== "completed") continue;
    completedByKeyword.set(
      cell.trackingKeywordId,
      (completedByKeyword.get(cell.trackingKeywordId) ?? 0) + 1,
    );
  }

  const targetIds = new Set(
    [
      input.business.placeId,
      input.business.cid,
      input.business.featureId,
    ].filter((value): value is string => Boolean(value)),
  );
  const targetName = input.business.name.trim().toLocaleLowerCase();
  const groups = new Map<string, CompetitorGroup>();

  for (const ranking of input.rankings) {
    const stableId = ranking.placeId ?? ranking.cid ?? ranking.featureId;
    if (
      (stableId && targetIds.has(stableId)) ||
      ranking.name.trim().toLocaleLowerCase() === targetName
    ) {
      continue;
    }
    const identity = stableId ?? ranking.name.trim().toLocaleLowerCase();
    const key = `${ranking.trackingKeywordId}:${identity}`;
    const current = groups.get(key);
    if (current) {
      current.rankTotal += ranking.rank;
      current.appearances += 1;
      if ((ranking.reviewCount ?? -1) > (current.reviewCount ?? -1)) {
        current.rating = ranking.rating;
        current.reviewCount = ranking.reviewCount;
      }
    } else {
      groups.set(key, {
        trackingKeywordId: ranking.trackingKeywordId,
        name: ranking.name,
        rankTotal: ranking.rank,
        appearances: 1,
        rating: ranking.rating,
        reviewCount: ranking.reviewCount,
      });
    }
  }

  const competitors: LocalGridCompetitorSummary[] = [];
  for (const keywordId of input.keywordIds) {
    const completed = completedByKeyword.get(keywordId) ?? 0;
    competitors.push(
      ...[...groups.values()]
        .filter((competitor) => competitor.trackingKeywordId === keywordId)
        .toSorted(
          (a, b) =>
            b.appearances - a.appearances ||
            a.rankTotal / a.appearances - b.rankTotal / b.appearances,
        )
        .slice(0, 3)
        .map((competitor) => ({
          trackingKeywordId: competitor.trackingKeywordId,
          name: competitor.name,
          averageRank: competitor.rankTotal / competitor.appearances,
          appearances: competitor.appearances,
          coveragePercent:
            completed === 0
              ? 0
              : Math.round((competitor.appearances / completed) * 100),
          rating: competitor.rating,
          reviewCount: competitor.reviewCount,
        })),
    );
  }
  return competitors;
}
