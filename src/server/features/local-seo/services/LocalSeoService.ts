import { env } from "cloudflare:workers";
import { z } from "zod";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { dataforseoPricing } from "@/server/lib/dataforseo/pricing";
import {
  getOrCreateOrganizationCustomer,
  getUsageCreditsRemaining,
  type BillingCustomerContext,
} from "@/server/billing/subscription";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { AppError } from "@/server/lib/errors";
import {
  creditsForProviderUsd,
  autumnSeoDataCreditsToUsd,
} from "@/shared/billing";
import {
  buildLocalGrid,
  isLocalScanActive,
  LocalPointStatus,
  LocalScanStatus,
} from "@/shared/local-seo";
import {
  localBusinessSchema,
  type createLocalTrackerSchema,
  type startLocalCheckSchema,
  type updateLocalKeywordsSchema,
} from "@/types/schemas/local-seo";
import {
  LocalSeoRepository as repo,
  type LocalCheckRow,
  type LocalTrackerRow,
} from "../repositories/LocalSeoRepository";
import { finalizeLocalCheck, localPointSearch } from "./localSeoCollection";
import { startWorkflow } from "@/server/lib/startWorkflow";

const profileSchema = z.object({
  title: z.string(),
  cid: z.string().nullish(),
  place_id: z.string().nullish(),
  address: z.string().nullish(),
  latitude: z.number(),
  longitude: z.number(),
});

async function lookupBusiness(
  query: string,
  market: { locationCode: number; languageCode: string },
  customer: BillingCustomerContext,
) {
  const profile = await createDataforseoClient(
    customer,
  ).business.myBusinessInfo({ keyword: query, ...market });
  if (!profile) return null;
  const parsed = profileSchema.safeParse(profile);
  if (!parsed.success)
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "This listing did not include usable map coordinates. Try its business name and full address.",
    );
  const row = parsed.data;
  return localBusinessSchema.parse({
    title: row.title,
    cid: row.cid ?? null,
    placeId: row.place_id ?? null,
    address: row.address ?? null,
    latitude: row.latitude,
    longitude: row.longitude,
  });
}

async function requireTracker(projectId: string, trackerId: string) {
  const tracker = await repo.getTracker(projectId, trackerId);
  if (!tracker)
    throw new AppError(
      "VALIDATION_ERROR",
      "Local SEO tracker not found in this project.",
    );
  return tracker;
}

async function createTracker(
  input: z.infer<typeof createLocalTrackerSchema>,
  languageCode: string,
) {
  const keywords = [...new Set(input.keywords)];
  const tracker = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    ...input.business,
    gridSize: input.gridSize,
    spacingKm: input.spacingKm,
    languageCode,
    createdAt: new Date().toISOString(),
  };
  // Validate generated coordinates before storing an unusable tracker.
  for (const point of buildLocalGrid(
    tracker,
    tracker.gridSize,
    tracker.spacingKm,
  )) {
    if (Math.abs(point.latitude) > 85 || Math.abs(point.longitude) > 180)
      throw new AppError(
        "VALIDATION_ERROR",
        "This grid extends beyond the map. Choose a smaller grid or spacing.",
      );
  }
  await repo.createTracker(
    tracker,
    keywords.map((keyword) => ({
      id: crypto.randomUUID(),
      trackerId: tracker.id,
      keyword,
    })),
  );
  return tracker;
}

/** Matches the per-search credit holds the check's live searches reserve. */
function checkCostCredits(tracker: LocalTrackerRow, keywords: number) {
  const search = localPointSearch(tracker, "", tracker);
  return (
    keywords *
    tracker.gridSize ** 2 *
    creditsForProviderUsd(dataforseoPricing.serp.local(search))
  );
}

async function reconcileCheck(check: LocalCheckRow) {
  if (!isLocalScanActive(check.status)) return check;
  let status: { status: string } | null = null;
  try {
    status = await (await env.LOCAL_RANK_WORKFLOW.get(check.id)).status();
  } catch {
    /* Startup and a missing workflow share this grace period. */
  }
  if (
    status &&
    ["running", "queued", "waiting", "waitingForPause", "paused"].includes(
      status.status,
    )
  )
    return check;
  if (
    (!status || status.status === "unknown") &&
    Date.now() - new Date(check.createdAt).getTime() < 60_000
  )
    return check;
  const error =
    "The check stopped before all results were saved. Completed points remain available; a new check uses credits.";
  await finalizeLocalCheck(check.projectId, check.id, error);
  return (await repo.getCheck(check.projectId, check.id)) ?? check;
}

async function getTracker(projectId: string, trackerId: string) {
  const tracker = await requireTracker(projectId, trackerId);
  const [keywords, checks] = await Promise.all([
    repo.getKeywords(trackerId),
    repo.listChecks(projectId, trackerId),
  ]);
  const reconciled = await Promise.all(checks.map(reconcileCheck));
  const checkIds = checks.map((check) => check.id);
  const [scans, summaries] = await Promise.all([
    repo.listScans(projectId, trackerId, checkIds),
    repo.getScanSummaries(projectId, trackerId, checkIds),
  ]);
  const summaryByScan = new Map(
    summaries.map((row) => [
      row.scanId,
      {
        total: row.total,
        completed: row.completed,
        found: row.found,
        top3: row.top3,
        top3Percent: row.completed
          ? Math.round((row.top3 / row.completed) * 100)
          : null,
        averageRank: row.found
          ? Number((row.rankTotal / row.found).toFixed(1))
          : null,
      },
    ]),
  );
  const costCredits = checkCostCredits(tracker, keywords.length);
  return {
    tracker,
    keywords,
    checks: reconciled,
    scans: scans.map((scan) => ({
      ...scan,
      summary: summaryByScan.get(scan.id),
    })),
    estimate: {
      costCredits,
      costUsd: autumnSeoDataCreditsToUsd(costCredits),
      keywords: keywords.length,
      points: tracker.gridSize ** 2,
      searches: keywords.length * tracker.gridSize ** 2,
    },
  };
}

async function updateKeywords(
  input: z.infer<typeof updateLocalKeywordsSchema>,
) {
  await requireTracker(input.projectId, input.trackerId);
  const active = await repo.getActiveCheck(input.projectId, input.trackerId);
  if (active && isLocalScanActive((await reconcileCheck(active)).status))
    throw new AppError(
      "VALIDATION_ERROR",
      "Wait for the current check to finish before changing keywords.",
    );
  const existing = await repo.getKeywords(input.trackerId, true);
  const keywords = [...new Set(input.keywords)];
  await repo.saveKeywords(
    input.trackerId,
    keywords.map((keyword) => ({
      id:
        existing.find((row) => row.keyword === keyword)?.id ??
        crypto.randomUUID(),
      trackerId: input.trackerId,
      keyword,
      archivedAt: null,
    })),
    existing
      .filter((row) => !row.archivedAt && !keywords.includes(row.keyword))
      .map((row) => row.id),
  );
}

async function startCheck(
  input: z.infer<typeof startLocalCheckSchema>,
  customer: BillingCustomerContext,
) {
  const tracker = await requireTracker(input.projectId, input.trackerId);
  const keywords = await repo.getKeywords(tracker.id);
  if (!keywords.length)
    throw new AppError(
      "VALIDATION_ERROR",
      "Add keywords before checking rankings.",
    );
  const existing = await repo.getCheck(input.projectId, input.requestId);
  if (existing) return existing;
  const active = await repo.getActiveCheck(input.projectId, tracker.id);
  if (active && isLocalScanActive((await reconcileCheck(active)).status))
    return active;
  const costCredits = checkCostCredits(tracker, keywords.length);
  if (costCredits > input.maxCostCredits)
    throw new AppError(
      "VALIDATION_ERROR",
      "The check estimate changed. Review the new cost before checking rankings.",
    );
  if (await isHostedServerAuthMode()) {
    const { id } = await getOrCreateOrganizationCustomer(customer);
    const credits = await getUsageCreditsRemaining(id);
    if (
      Math.max(credits.monthlyRemaining, 0) +
        Math.max(credits.topupRemaining, 0) <
      costCredits
    )
      throw new AppError("INSUFFICIENT_CREDITS");
  }
  const check: LocalCheckRow = {
    id: input.requestId,
    projectId: input.projectId,
    trackerId: tracker.id,
    status: LocalScanStatus.Queued,
    error: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  const scans = keywords.map((keyword) => ({
    ...check,
    id: crypto.randomUUID(),
    checkId: check.id,
    keywordId: keyword.id,
  }));
  try {
    await repo.createCheck(
      check,
      scans,
      scans.flatMap((scan) =>
        buildLocalGrid(tracker, tracker.gridSize, tracker.spacingKm).map(
          (point) => ({
            id: crypto.randomUUID(),
            scanId: scan.id,
            ...point,
            status: LocalPointStatus.Pending,
          }),
        ),
      ),
    );
  } catch (error) {
    const blocker = await repo.getActiveCheck(input.projectId, tracker.id);
    if (blocker) return blocker;
    throw error;
  }
  try {
    await startWorkflow(
      env.LOCAL_RANK_WORKFLOW,
      { id: check.id, params: { checkId: check.id, customer } },
      "local rank check",
    );
  } catch (error) {
    // Nothing paid is posted here; reconciliation fails the check later.
    console.error("[local-seo] workflow start failed:", error);
  }
  return check;
}

async function getScan(projectId: string, scanId: string) {
  const scan = await repo.getScan(projectId, scanId);
  if (!scan)
    throw new AppError(
      "VALIDATION_ERROR",
      "Local SEO scan not found in this project.",
    );
  const check = await repo.getCheck(projectId, scan.checkId);
  if (check) await reconcileCheck(check);
  // Every point's businesses come with the scan (at most 25 × 20 rows), so
  // switching points never waits on a request.
  const [points, results] = await Promise.all([
    repo.getPoints(scan.id),
    repo.getScanResults(projectId, scan.id),
  ]);
  return {
    scan: (await repo.getScan(projectId, scanId)) ?? scan,
    points,
    results,
  };
}

export const LocalSeoService = {
  listTrackers: repo.listTrackers,
  lookupBusiness,
  createTracker,
  getTracker,
  updateKeywords,
  startCheck,
  getScan,
};
