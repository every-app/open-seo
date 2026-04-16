import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { AppError } from "@/server/lib/errors";
import type { ComparePeriod } from "@/types/schemas/rank-tracking";
import type {
  RankTrackingDeviceResult,
  RankTrackingRow,
} from "@/types/schemas/rank-tracking";

type SnapshotRow = Awaited<
  ReturnType<typeof RankTrackingRepository.getLatestSnapshotsForKeywords>
>[0];

const PERIOD_DAYS: Record<ComparePeriod, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export async function getLatestResults(
  configId: string,
  projectId: string,
  comparePeriod: ComparePeriod = "7d",
): Promise<{
  rows: RankTrackingRow[];
  run: { id: string; lastCheckedAt: string } | null;
}> {
  const config = await RankTrackingRepository.getConfigById({
    configId,
    projectId,
  });
  if (!config) {
    throw new AppError("INTERNAL_ERROR", "Rank tracking config not found");
  }

  const activeKeywords =
    await RankTrackingRepository.getKeywordsForConfig(configId);

  // Get the latest snapshot per keyword per device (across all completed runs)
  const currentSnapshots =
    await RankTrackingRepository.getLatestSnapshotsForKeywords(configId);

  // Get comparison snapshots from before the target date
  const days = PERIOD_DAYS[comparePeriod];
  const targetDate = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();

  const comparisonSnapshots =
    await RankTrackingRepository.getSnapshotsBeforeDate(configId, targetDate);

  const previousPositions = new Map<string, number | null>();
  for (const snap of comparisonSnapshots) {
    previousPositions.set(
      `${snap.trackingKeywordId}:${snap.device}`,
      snap.position,
    );
  }

  // Fallback: for keyword+device combos with no comparison snapshot before
  // the target date, use the earliest available snapshot as a baseline.
  const missingKeywordIds: string[] = [];
  for (const snap of currentSnapshots) {
    const key = `${snap.trackingKeywordId}:${snap.device}`;
    if (!previousPositions.has(key)) {
      missingKeywordIds.push(snap.trackingKeywordId);
    }
  }

  if (missingKeywordIds.length > 0) {
    const uniqueMissingIds = [...new Set(missingKeywordIds)];
    const earliestSnapshots =
      await RankTrackingRepository.getEarliestSnapshotsForKeywords(
        configId,
        uniqueMissingIds,
      );
    for (const snap of earliestSnapshots) {
      const key = `${snap.trackingKeywordId}:${snap.device}`;
      if (!previousPositions.has(key)) {
        previousPositions.set(key, snap.position);
      }
    }
  }

  // Build result rows
  const rows = new Map<string, RankTrackingRow>(
    activeKeywords.map((keyword) => [
      keyword.id,
      {
        trackingKeywordId: keyword.id,
        keyword: keyword.keyword,
        searchVolume: keyword.searchVolume,
        keywordDifficulty: keyword.keywordDifficulty,
        cpc: keyword.cpc,
        desktop: createEmptyDeviceResult(
          previousPositions.get(`${keyword.id}:desktop`) ?? null,
        ),
        mobile: createEmptyDeviceResult(
          previousPositions.get(`${keyword.id}:mobile`) ?? null,
        ),
      },
    ]),
  );

  // Determine the most recent snapshot time for the run info
  let latestRunId: string | null = null;
  let latestStartedAt: string | null = null;

  for (const snapshot of currentSnapshots) {
    const row = rows.get(snapshot.trackingKeywordId);
    if (!row) continue;
    row[snapshot.device] = toDeviceResult(
      snapshot,
      previousPositions.get(
        `${snapshot.trackingKeywordId}:${snapshot.device}`,
      ) ?? null,
    );

    // Track the most recent run for the header display
    if (!latestStartedAt || snapshot.checkedAt > latestStartedAt) {
      latestRunId = snapshot.runId;
      latestStartedAt = snapshot.checkedAt;
    }
  }

  return {
    rows: activeKeywords
      .map((keyword) => rows.get(keyword.id))
      .filter((row): row is RankTrackingRow => row != null),
    run:
      latestRunId && latestStartedAt
        ? { id: latestRunId, lastCheckedAt: latestStartedAt }
        : null,
  };
}

function parseSerpFeatures(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    // ignore
  }
  return [];
}

function createEmptyDeviceResult(
  previousPosition: number | null,
): RankTrackingDeviceResult {
  return {
    position: null,
    previousPosition,
    rankingUrl: null,
    serpFeatures: [],
  };
}

function toDeviceResult(
  snapshot: SnapshotRow,
  previousPosition: number | null,
): RankTrackingDeviceResult {
  return {
    position: snapshot.position,
    previousPosition,
    rankingUrl: snapshot.url,
    serpFeatures: parseSerpFeatures(snapshot.serpFeatures),
  };
}
