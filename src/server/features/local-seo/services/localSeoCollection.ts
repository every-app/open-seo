import { z } from "zod";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { AppError } from "@/server/lib/errors";
import {
  isLocalScanActive,
  localGridZoom,
  LOCAL_RANK_DEPTH,
  LocalPointStatus,
  LocalScanStatus,
} from "@/shared/local-seo";
import {
  LocalSeoRepository as repo,
  type LocalPointRow,
  type LocalTrackerRow,
} from "../repositories/LocalSeoRepository";

const resultSchema = z.object({
  title: z.string(),
  cid: z.string().nullish(),
  place_id: z.string().nullish(),
  address: z.string().nullish(),
  rank_absolute: z.number().int().positive().nullish(),
  rank_group: z.number().int().positive().nullish(),
  rating: z
    .object({
      value: z.number().nullish(),
      votes_count: z.number().int().nullish(),
    })
    .nullish(),
});

const SEARCH_FAILED = "The search provider could not complete this point.";

/** The live Maps search for one grid point. */
export function localPointSearch(
  tracker: LocalTrackerRow,
  keyword: string,
  point: { latitude: number; longitude: number },
) {
  const zoom = localGridZoom(tracker.spacingKm, tracker.latitude);
  return {
    keyword,
    locationCoordinate: `${point.latitude},${point.longitude},${zoom}z`,
    languageCode: tracker.languageCode,
    searchType: "maps" as const,
    device: "mobile" as const,
    depth: LOCAL_RANK_DEPTH,
    searchPlaces: false,
  };
}

export async function prepareLocalCheck(projectId: string, checkId: string) {
  const check = await repo.getCheck(projectId, checkId);
  if (!check || !isLocalScanActive(check.status))
    throw new AppError(
      "VALIDATION_ERROR",
      "This check is no longer available.",
    );
  // Archived keywords are included: a keyword removed after the check
  // started is still searched as queued.
  const [tracker, keywords, scans] = await Promise.all([
    repo.getTracker(projectId, check.trackerId),
    repo.getKeywords(check.trackerId, true),
    repo.getScansForCheck(projectId, checkId),
  ]);
  if (!tracker)
    throw new AppError(
      "VALIDATION_ERROR",
      "The scan configuration is no longer available.",
    );
  const plans = await Promise.all(
    scans.map(async (scan) => {
      const keyword = keywords.find((row) => row.id === scan.keywordId);
      if (!keyword)
        throw new AppError(
          "VALIDATION_ERROR",
          "The scan configuration is no longer available.",
        );
      await repo.updateScan(projectId, scan.id, {
        status: LocalScanStatus.Running,
      });
      return {
        scanId: scan.id,
        tracker,
        keyword: keyword.keyword,
        points: await repo.getPoints(scan.id),
      };
    }),
  );
  await repo.updateCheck(projectId, checkId, {
    status: LocalScanStatus.Running,
  });
  return plans;
}

type LocalScanPlan = Awaited<ReturnType<typeof prepareLocalCheck>>[number];

/** Runs one paid live search per point and saves each point as it returns. */
export async function searchLocalPoints(
  plan: LocalScanPlan,
  points: LocalPointRow[],
  customer: BillingCustomerContext,
) {
  const outcomes = await createDataforseoClient(customer).serp.localBatch(
    points.map((point) => localPointSearch(plan.tracker, plan.keyword, point)),
  );
  await Promise.all(
    outcomes.map((outcome, index) => {
      const point = points[index];
      // One unusable point must not discard the batch's other paid results.
      const saved =
        outcome.status === "fulfilled"
          ? savePointResults(plan.tracker, point, outcome.value)
          : Promise.reject(outcome.reason);
      return saved.catch((error: unknown) => {
        console.warn(`[local-seo] point ${point.id} failed:`, error);
        return repo.failPoint(point.id, SEARCH_FAILED);
      });
    }),
  );
}

export async function failLocalPoints(points: LocalPointRow[]) {
  await Promise.all(
    points.map((point) => repo.failPoint(point.id, SEARCH_FAILED)),
  );
}

async function savePointResults(
  tracker: LocalTrackerRow,
  point: LocalPointRow,
  items: Record<string, unknown>[],
) {
  const parsedRows = items.map((item, index) => {
    const row = resultSchema.parse(item);
    const rank = row.rank_absolute ?? row.rank_group ?? index + 1;
    const identity = row.cid
      ? `cid:${row.cid}`
      : row.place_id
        ? `place:${row.place_id}`
        : `point:${point.id}:${rank}`;
    return {
      id: `${point.scanId}:${identity}`,
      scanId: point.scanId,
      identity,
      title: row.title,
      cid: row.cid ?? null,
      placeId: row.place_id ?? null,
      address: row.address ?? null,
      rating: row.rating?.value ?? null,
      reviews: row.rating?.votes_count ?? null,
      rank,
    };
  });
  const rows = parsedRows.filter(
    (row, index) =>
      parsedRows.findIndex((other) => other.identity === row.identity) ===
      index,
  );
  const target = rows.find(
    (row) =>
      (tracker.cid != null && row.cid === tracker.cid) ||
      (tracker.placeId != null && row.placeId === tracker.placeId),
  );
  await repo.savePoint(
    point,
    rows,
    rows.map((row) => ({ businessId: row.id, rank: row.rank })),
    target?.rank ?? null,
    items.length,
  );
}

async function finalizeLocalScan(
  projectId: string,
  scanId: string,
  error?: string,
) {
  await repo.failPendingPoints(
    scanId,
    error ??
      "This point did not finish in time. The search may still have used credits.",
  );
  const points = await repo.getPoints(scanId);
  const completed = points.filter(
    (p) => p.status === LocalPointStatus.Completed,
  ).length;
  await repo.updateScan(projectId, scanId, {
    status:
      completed === points.length && completed > 0
        ? LocalScanStatus.Completed
        : completed > 0
          ? LocalScanStatus.Partial
          : LocalScanStatus.Failed,
    error: error ?? null,
    completedAt: new Date().toISOString(),
  });
}

export async function finalizeLocalCheck(
  projectId: string,
  checkId: string,
  error?: string,
) {
  let scans = await repo.getScansForCheck(projectId, checkId);
  for (const scan of scans) {
    if (isLocalScanActive(scan.status))
      await finalizeLocalScan(projectId, scan.id, error);
  }
  scans = await repo.getScansForCheck(projectId, checkId);
  const completed = scans.filter(
    (scan) => scan.status === LocalScanStatus.Completed,
  ).length;
  const hasResults = scans.some(
    (scan) =>
      scan.status === LocalScanStatus.Completed ||
      scan.status === LocalScanStatus.Partial,
  );
  await repo.updateCheck(projectId, checkId, {
    status:
      completed === scans.length && completed > 0
        ? LocalScanStatus.Completed
        : hasResults
          ? LocalScanStatus.Partial
          : LocalScanStatus.Failed,
    completedAt: new Date().toISOString(),
    error: error ?? null,
  });
}
