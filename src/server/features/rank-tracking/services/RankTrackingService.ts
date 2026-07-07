import { env } from "cloudflare:workers";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  createDataforseoClient,
  fetchKeywordMetricsForList,
} from "@/server/lib/dataforseo";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { AppError } from "@/server/lib/errors";
import type {
  RankTrackingConfig,
  RankCheckTriggerResult,
} from "@/types/schemas/rank-tracking";
import {
  beginRankCheckRun,
  reconcileActiveRankCheckRun,
} from "./rankCheckRunGuards";
import {
  estimateRankCheckCredits,
  computeNextCheckAt,
  devicesCount,
  isScheduledRankTrackingInterval,
  MAX_KEYWORDS_PER_CONFIG,
  MAX_CONFIGS_PER_PROJECT,
} from "@/shared/rank-tracking";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

async function createConfig(input: {
  projectId: string;
  domain: string;
  locationCode?: number;
  languageCode?: string;
  locationName?: string;
  devices?: RankTrackingConfig["devices"];
  serpDepth: number;
  scheduleInterval?: RankTrackingConfig["scheduleInterval"];
}) {
  const normalizedDomain = normalizeDomain(input.domain);

  const locationCode = input.locationCode ?? 2840;
  const scheduleInterval = input.scheduleInterval ?? "weekly";
  const nextCheckAt = isScheduledRankTrackingInterval(scheduleInterval)
    ? computeNextCheckAt(scheduleInterval)
    : null;

  const locationName = input.locationName ?? null;
  const existing =
    await RankTrackingRepository.getConfigByProjectDomainLocation(
      input.projectId,
      normalizedDomain,
      locationCode,
      locationName,
    );
  // The (project, domain, location) row still exists when a domain is
  // archived — archiving only flips isActive to false. So re-adding an
  // archived domain reactivates that row (keeping its keyword/ranking
  // history) with the freshly chosen settings, rather than colliding with
  // the unique index. An already-active row is a genuine duplicate.
  if (existing?.isActive) {
    throw new AppError(
      "VALIDATION_ERROR",
      locationName
        ? "This domain + city combination is already being tracked"
        : "This domain + country combination is already being tracked",
    );
  }

  // Enforced for reactivations too, not just new rows — otherwise archiving
  // and re-adding domains would push a project past the active-config cap.
  const allConfigs = await RankTrackingRepository.getConfigsForProject(
    input.projectId,
  );
  if (allConfigs.length >= MAX_CONFIGS_PER_PROJECT) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Maximum ${MAX_CONFIGS_PER_PROJECT} tracked domains per project`,
    );
  }

  if (existing) {
    await RankTrackingRepository.updateConfig(existing.id, input.projectId, {
      isActive: true,
      languageCode: input.languageCode ?? "en",
      devices: input.devices ?? "both",
      serpDepth: input.serpDepth,
      scheduleInterval,
      nextCheckAt,
      // Drop any stale skip reason from before it was archived so the
      // re-added domain doesn't surface an outdated warning.
      lastSkipReason: null,
    });

    return { configId: existing.id };
  }

  const configId = crypto.randomUUID();

  await RankTrackingRepository.createConfig({
    id: configId,
    projectId: input.projectId,
    domain: normalizedDomain,
    locationCode,
    languageCode: input.languageCode ?? "en",
    locationName,
    devices: input.devices ?? "both",
    serpDepth: input.serpDepth,
    scheduleInterval,
    nextCheckAt,
  });

  return { configId };
}

async function updateConfig(
  configId: string,
  projectId: string,
  input: {
    domain?: string;
    locationCode?: number;
    languageCode?: string;
    locationName?: string | null;
    devices?: RankTrackingConfig["devices"];
    serpDepth?: number;
    scheduleInterval?: RankTrackingConfig["scheduleInterval"];
    isActive?: boolean;
  },
) {
  const updates: typeof input & { nextCheckAt?: string | null } = {};

  if (input.domain !== undefined)
    updates.domain = normalizeDomain(input.domain);
  if (input.locationCode !== undefined)
    updates.locationCode = input.locationCode;
  if (input.languageCode !== undefined)
    updates.languageCode = input.languageCode;
  if (input.locationName !== undefined)
    updates.locationName = input.locationName;
  if (input.devices !== undefined) updates.devices = input.devices;
  if (input.serpDepth !== undefined) updates.serpDepth = input.serpDepth;
  if (input.isActive !== undefined) updates.isActive = input.isActive;

  if (input.scheduleInterval !== undefined) {
    updates.scheduleInterval = input.scheduleInterval;
    if (input.scheduleInterval === "manual") {
      updates.nextCheckAt = null;
    } else {
      updates.nextCheckAt = computeNextCheckAt(input.scheduleInterval);
    }
  }

  await RankTrackingRepository.updateConfig(configId, projectId, updates);
}

// ---------------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------------

async function addKeywords(
  configId: string,
  projectId: string,
  keywords: string[],
) {
  await getValidatedConfig(configId, projectId);

  // Filter out keywords that already exist for this config.
  // We must do this before inserting because onConflictDoNothing silently
  // skips duplicates but we pre-generate UUIDs — returning those phantom IDs
  // would cause the auto-check workflow to find no keywords and fail.
  const existing = await RankTrackingRepository.getKeywordsForConfig(configId);

  if (existing.length >= MAX_KEYWORDS_PER_CONFIG) {
    throw new AppError(
      "INTERNAL_ERROR",
      `Maximum ${MAX_KEYWORDS_PER_CONFIG} keywords per domain. Currently tracking ${existing.length}.`,
    );
  }

  const existingKeywords = new Set(existing.map((kw) => kw.keyword));
  const available = MAX_KEYWORDS_PER_CONFIG - existing.length;

  const seen = new Set<string>();
  const rows: Array<{ id: string; configId: string; keyword: string }> = [];
  for (const raw of keywords) {
    if (rows.length >= available) break;
    const normalized = raw.trim().toLowerCase();
    if (
      normalized &&
      !seen.has(normalized) &&
      !existingKeywords.has(normalized)
    ) {
      seen.add(normalized);
      rows.push({ id: crypto.randomUUID(), configId, keyword: normalized });
    }
  }

  if (rows.length > 0) {
    await RankTrackingRepository.addKeywordsToConfig(rows);
  }

  return { added: rows.length, addedIds: rows.map((r) => r.id) };
}

async function removeKeywords(
  configId: string,
  projectId: string,
  keywordIds: string[],
) {
  await getValidatedConfig(configId, projectId);
  await RankTrackingRepository.removeKeywordsFromConfig(keywordIds, configId);
}

// ---------------------------------------------------------------------------
// Trigger a manual check
// ---------------------------------------------------------------------------

async function triggerCheck(input: {
  configId: string;
  projectId: string;
  billingCustomer: BillingCustomerContext;
  keywordIds?: string[];
}): Promise<RankCheckTriggerResult> {
  const config = await getValidatedConfig(input.configId, input.projectId);

  const keywords = await RankTrackingRepository.getKeywordsForConfig(config.id);
  if (keywords.length === 0) {
    throw new AppError(
      "INTERNAL_ERROR",
      "No keywords to track. Add keywords to this domain first.",
    );
  }

  return beginRankCheckRun({
    workflow: env.RANK_CHECK_WORKFLOW,
    config,
    projectId: input.projectId,
    billingCustomer: {
      userId: input.billingCustomer.userId,
      userEmail: input.billingCustomer.userEmail,
      organizationId: input.billingCustomer.organizationId,
      projectId: input.billingCustomer.projectId,
    },
    keywordsTotal: input.keywordIds ? input.keywordIds.length : keywords.length,
    keywordIds: input.keywordIds,
    trigger: "manual",
    workflowStartErrorMessage: "Failed to start rank check workflow",
  });
}

async function getLatestRun(configId: string, projectId: string) {
  await getValidatedConfig(configId, projectId);
  const run = await RankTrackingRepository.getLatestRunForConfig(configId);
  if (!run) return null;

  // If the DB says the run is still active, check the workflow instance.
  // We only report staleness here — the next call to beginRankCheckRun will
  // mark a stale blocker as failed before retrying its insert. Mutating from
  // this read path caused a race where the original workflow kept running
  // while a replacement was started.
  const reconciliation = await reconcileActiveRankCheckRun(run);
  if (reconciliation) {
    return formatRun(run, {
      maybeStale: true,
      staleReason: reconciliation.errorMessage,
    });
  }

  return formatRun(run);
}

// ---------------------------------------------------------------------------
// Keyword metrics (volume, difficulty, CPC)
// ---------------------------------------------------------------------------

async function refreshKeywordMetrics(
  configId: string,
  projectId: string,
  billingCustomer: BillingCustomerContext,
): Promise<{ updated: number }> {
  const [config, keywords] = await Promise.all([
    getValidatedConfig(configId, projectId),
    RankTrackingRepository.getKeywordsForConfig(configId),
  ]);
  if (keywords.length === 0) return { updated: 0 };

  const client = createDataforseoClient(billingCustomer);
  const metrics = await fetchKeywordMetricsForList(client, {
    keywords: keywords.map((kw) => kw.keyword),
    locationCode: config.locationCode,
    languageCode: config.languageCode,
    // Local configs get volume/CPC scoped to the tracked city; national
    // numbers can overstate local demand by orders of magnitude.
    locationName: config.locationName ?? undefined,
    creditFeature: "rank_tracking",
  });
  const byKeyword = new Map(
    metrics.map((metric) => [metric.keyword.toLowerCase(), metric]),
  );

  const now = new Date().toISOString();
  const updates = keywords
    .map((kw) => {
      const metric = byKeyword.get(kw.keyword.toLowerCase());
      if (!metric) return null;
      // Rank tracking only tracks volume / difficulty / CPC.
      return {
        id: kw.id,
        searchVolume: metric.searchVolume,
        keywordDifficulty: metric.keywordDifficulty,
        cpc: metric.cpc,
        metricsFetchedAt: now,
      };
    })
    .filter((u): u is NonNullable<typeof u> => u !== null);

  if (updates.length === 0) return { updated: 0 };
  await RankTrackingRepository.updateKeywordMetrics(updates);
  return { updated: updates.length };
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

async function estimateCost(configId: string, projectId: string) {
  const config = await getValidatedConfig(configId, projectId);
  const keywordCount =
    await RankTrackingRepository.getKeywordCountForConfig(configId);
  // Estimates the cost of a manual "check now", which always runs live.
  const { costUsd, costCredits } = estimateRankCheckCredits(
    keywordCount,
    config.devices,
    config.serpDepth,
    "live",
  );
  return {
    costUsd,
    costCredits,
    keywordCount,
    devicesCount: devicesCount(config.devices),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getValidatedConfig(configId: string, projectId: string) {
  const config = await RankTrackingRepository.getConfigById({
    configId,
    projectId,
  });
  if (!config) {
    throw new AppError("INTERNAL_ERROR", "Rank tracking config not found");
  }
  return config;
}

function normalizeDomain(domain: string): string {
  let d = domain.trim().toLowerCase();
  // Strip protocol
  d = d.replace(/^https?:\/\//, "");
  // Strip path, query string, and fragment
  d = d.replace(/[/?#].*$/, "");
  // Strip trailing slash
  d = d.replace(/\/+$/, "");
  // Strip www. prefix
  d = d.replace(/^www\./, "");
  if (!d) {
    throw new AppError("INTERNAL_ERROR", "Invalid domain");
  }
  return d;
}

type RunRow = NonNullable<
  Awaited<ReturnType<typeof RankTrackingRepository.getLatestRunForConfig>>
>;

function formatRun(
  run: RunRow,
  stale?: { maybeStale: boolean; staleReason: string },
) {
  return {
    id: run.id,
    status: run.status,
    keywordsTotal: run.keywordsTotal,
    keywordsChecked: run.keywordsChecked,
    isSubsetRun: run.isSubsetRun,
    errorMessage: run.errorMessage,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    maybeStale: stale?.maybeStale ?? false,
    staleReason: stale?.staleReason ?? null,
  };
}

export const RankTrackingService = {
  createConfig,
  updateConfig,
  addKeywords,
  removeKeywords,
  triggerCheck,
  getLatestRun,
  estimateCost,
  refreshKeywordMetrics,
};
