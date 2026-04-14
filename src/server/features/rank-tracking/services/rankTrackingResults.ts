import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { AppError } from "@/server/lib/errors";
import type { ComparePeriod } from "@/types/schemas/rank-tracking";
import type {
  RankTrackingDeviceResult,
  RankTrackingRow,
} from "@/types/schemas/rank-tracking";

type SnapshotRow = Awaited<
  ReturnType<typeof RankTrackingRepository.getSnapshotsForRun>
>[0];

const PERIOD_DAYS: Record<Exclude<ComparePeriod, "previous">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export async function getLatestResults(
  configId: string,
  projectId: string,
  comparePeriod: ComparePeriod = "previous",
): Promise<{
  rows: RankTrackingRow[];
  run: { id: string; startedAt: string } | null;
}> {
  const config = await RankTrackingRepository.getConfigById({
    configId,
    projectId,
  });
  if (!config) {
    throw new AppError("INTERNAL_ERROR", "Rank tracking config not found");
  }

  const recentRuns = await RankTrackingRepository.getRecentCompletedRuns(
    configId,
    2,
  );
  const currentRun = recentRuns[0];
  if (!currentRun) {
    return { rows: [], run: null };
  }

  const currentSnapshots = await RankTrackingRepository.getSnapshotsForRun(
    currentRun.id,
  );

  // Load comparison run's snapshots for delta computation
  const previousPositions = new Map<string, number | null>();
  let comparisonRun: typeof currentRun | null = null;

  if (comparePeriod === "previous") {
    comparisonRun = recentRuns[1] ?? null;
  } else {
    const days = PERIOD_DAYS[comparePeriod];
    const targetDate = new Date(
      Date.now() - days * 24 * 60 * 60 * 1000,
    ).toISOString();
    const closest = await RankTrackingRepository.getClosestCompletedRun(
      configId,
      targetDate,
    );
    // Don't compare a run against itself
    if (closest && closest.id !== currentRun.id) {
      comparisonRun = closest;
    }
  }

  if (comparisonRun) {
    const prevSnapshots = await RankTrackingRepository.getSnapshotsForRun(
      comparisonRun.id,
    );
    for (const snap of prevSnapshots) {
      previousPositions.set(
        `${snap.trackingKeywordId}:${snap.device}`,
        snap.position,
      );
    }
  }

  const activeKeywords =
    await RankTrackingRepository.getKeywordsForConfig(configId);
  const rows = new Map<string, RankTrackingRow>(
    activeKeywords.map((keyword) => [
      keyword.id,
      {
        trackingKeywordId: keyword.id,
        keyword: keyword.keyword,
        desktop: createEmptyDeviceResult(
          previousPositions.get(`${keyword.id}:desktop`) ?? null,
        ),
        mobile: createEmptyDeviceResult(
          previousPositions.get(`${keyword.id}:mobile`) ?? null,
        ),
      },
    ]),
  );

  for (const snapshot of currentSnapshots) {
    const row = rows.get(snapshot.trackingKeywordId);
    if (!row) continue;
    row[snapshot.device] = toDeviceResult(
      snapshot,
      previousPositions.get(
        `${snapshot.trackingKeywordId}:${snapshot.device}`,
      ) ?? null,
    );
  }

  return {
    rows: activeKeywords
      .map((keyword) => rows.get(keyword.id))
      .filter((row): row is RankTrackingRow => row != null),
    run: {
      id: currentRun.id,
      startedAt: currentRun.startedAt,
    },
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
