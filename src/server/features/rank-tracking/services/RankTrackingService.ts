/* eslint-disable max-lines -- fork delete_rank_tracker + SEO-history hook merged with upstream rank-check validation */
import { env } from "cloudflare:workers";
import {
  customerHasPaidPlan,
  type BillingCustomerContext,
} from "@/server/billing/subscription";
import {
  createDataforseoClient,
  fetchKeywordMetricsForList,
} from "@/server/lib/dataforseo";
import { RankTrackingRepository } from "@/server/features/rank-tracking/repositories/RankTrackingRepository";
import { deleteConfigCascade } from "@/server/features/rank-tracking/repositories/deleteConfigCascade";
import { assertSerpLocationNameAccepted } from "@/server/lib/dataforseo/serp-location-validate";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import type {
  RankCheckScheduleTime,
  RankTrackingConfig,
  RankCheckTriggerResult,
} from "@/types/schemas/rank-tracking";
import {
  beginRankCheckRun,
  reconcileActiveRankCheckRun,
} from "./rankCheckRunGuards";
import {
  computeNextCheckAt,
  estimateRankCheckCredits,
  isScheduledRankTrackingInterval,
  MAX_CONFIGS_PER_PROJECT,
  rankCheckCostApprovalError,
  rankCheckMethod,
  VALIDATED_CRAWLS_PER_PAIR,
} from "@/shared/rank-tracking";
import {
  getIsoCountryCode,
  resolveKeywordDataLanguage,
  resolveMarket,
} from "@/shared/keyword-locations";
import { getLatestResults } from "./rankTrackingResults";
import { toRankTrackingTimestamp } from "@/server/features/rank-tracking/rankTrackingTimestamps";
import { RankTrackingKeywordService } from "./RankTrackingKeywordService";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

async function createConfig(input: {
  projectId: string;
  projectMarket: { locationCode: number; languageCode: string };
  domain: string;
  locationCode?: number;
  languageCode?: string;
  locationName?: string;
  devices?: RankTrackingConfig["devices"];
  serpDepth: number;
  scheduleInterval?: RankTrackingConfig["scheduleInterval"];
  scheduleTime?: RankCheckScheduleTime;
}) {
  const normalizedDomain = normalizeDomain(input.domain);

  const { locationCode, languageCode } = resolveMarket(
    input,
    input.projectMarket,
  );
  const scheduleInterval = input.scheduleInterval ?? "weekly";
  const nextCheckAt = resolveNextCheckAt(scheduleInterval, input.scheduleTime);

  const locationName = input.locationName ?? null;
  // Before the duplicate/limit checks so an unusable location name is the
  // error the caller sees.
  if (locationName) {
    await assertSerpLocationNameAccepted({
      locationName,
      languageCode,
      countryCode: getIsoCountryCode(locationCode),
    });
  }

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
      languageCode,
      devices: input.devices ?? "both",
      serpDepth: input.serpDepth,
      scheduleInterval,
      nextCheckAt,
      // Drop any stale skip reason from before it was archived so the
      // re-added domain doesn't surface an outdated warning.
      lastSkipReason: null,
    });

    return getValidatedConfig(existing.id, input.projectId);
  }

  const configId = crypto.randomUUID();
  const config: RankTrackingConfig = {
    id: configId,
    projectId: input.projectId,
    domain: normalizedDomain,
    locationCode,
    languageCode,
    locationName,
    devices: input.devices ?? "both",
    serpDepth: input.serpDepth,
    scheduleInterval,
    nextCheckAt,
    isActive: true,
    lastCheckedAt: null,
    lastSkipReason: null,
    createdAt: toRankTrackingTimestamp(new Date()),
  };

  await RankTrackingRepository.createConfig(config);

  return config;
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
    scheduleTime?: RankCheckScheduleTime;
    isActive?: boolean;
  },
) {
  const { scheduleTime, ...fields } = input;
  const updates: typeof fields & { nextCheckAt?: string | null } = {};
  const existing = await getValidatedConfig(configId, projectId);

  // A location name is only valid together with its market, so re-check the
  // resulting (name, language, country) whenever any of the three changes.
  const marketChanged =
    input.locationName !== undefined ||
    input.locationCode !== undefined ||
    input.languageCode !== undefined;
  if (marketChanged) {
    const locationName =
      input.locationName === undefined
        ? existing.locationName
        : input.locationName;
    if (locationName) {
      await assertSerpLocationNameAccepted({
        locationName,
        languageCode: input.languageCode ?? existing.languageCode,
        countryCode: getIsoCountryCode(
          input.locationCode ?? existing.locationCode,
        ),
      });
    }
  }

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

  const scheduleInterval = input.scheduleInterval ?? existing.scheduleInterval;
  // The config modal resends the interval on every save, so only move the
  // anchor when the schedule really changed — otherwise editing, say, devices
  // would re-randomize the run time.
  if (
    scheduleTime ||
    scheduleInterval !== existing.scheduleInterval ||
    (scheduleInterval !== "manual" && !existing.nextCheckAt)
  ) {
    updates.scheduleInterval = scheduleInterval;
    updates.nextCheckAt = resolveNextCheckAt(scheduleInterval, scheduleTime);
  }

  await RankTrackingRepository.updateConfig(configId, projectId, updates);
}

async function deleteTracker(configId: string, projectId: string) {
  const config = await getValidatedConfig(configId, projectId);

  const activeRun =
    await RankTrackingRepository.getActiveRunForConfig(configId);
  if (activeRun && !(await reconcileActiveRankCheckRun(activeRun))) {
    // Genuinely in flight (or within the startup grace window) — deleting now
    // would yank rows out from under the running workflow. A non-null
    // reconciliation means the workflow instance is gone; that stale run row
    // is swept up by the cascade below.
    throw new AppError(
      "CONFLICT",
      "A rank check is currently running for this tracker. Wait for it to finish, then delete.",
    );
  }

  const keywordCounts = await RankTrackingRepository.getKeywordCountsForConfigs(
    [configId],
  );
  const keywordCount = keywordCounts.get(configId) ?? 0;
  await deleteConfigCascade(configId);
  return { config, keywordCount };
}

function resolveNextCheckAt(
  scheduleInterval: RankTrackingConfig["scheduleInterval"],
  scheduleTime: RankCheckScheduleTime | undefined,
): string | null {
  if (isScheduledRankTrackingInterval(scheduleInterval)) {
    // Without one the check would quietly repeat on whatever day today is.
    if (
      scheduleInterval === "weekly" &&
      scheduleTime &&
      scheduleTime.weekday === undefined
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        "A weekly schedule time needs a weekday",
      );
    }
    return computeNextCheckAt(scheduleInterval, null, scheduleTime);
  }
  if (scheduleTime) {
    throw new AppError(
      "VALIDATION_ERROR",
      "A schedule time needs a daily, weekly, or monthly schedule",
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Trigger a manual check
// ---------------------------------------------------------------------------

async function triggerCheck(input: {
  configId: string;
  projectId: string;
  billingCustomer: BillingCustomerContext;
  keywordIds?: string[];
  maxCostCredits?: number;
  validateSerps?: boolean;
}): Promise<RankCheckTriggerResult> {
  const config = await getValidatedConfig(input.configId, input.projectId);

  await requireRankCheckAccess(input.billingCustomer.organizationId);

  if (input.validateSerps) {
    // Validation reads Google's English page text (rankCheckQueuedPath), so a
    // tracker in another language cannot be validated; say so rather than run
    // an unchecked queue check the caller would take for a checked one.
    if (!/^en(?:[-_]|$)/i.test(config.languageCode)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Validated checks read Google's English page text; this tracker uses language_code "${config.languageCode}".`,
      );
    }
    // It asks whether Google applied a city or region. On a whole-country
    // tracker the national list is the right reading, and Google shows the
    // precise-location prompt there too, so every page would read as dropped.
    // Google geo target IDs below 10000 are countries; DataForSEO names
    // sub-country locations as "City,Region,Country".
    const subCountry = config.locationName
      ? config.locationName.includes(",")
      : config.locationCode >= 10000;
    if (!subCountry) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Validated checks need a city or region location; this tracker is set to a whole country.",
      );
    }
  }

  const keywords = await RankTrackingRepository.getKeywordsForConfig(config.id);
  if (keywords.length === 0) {
    throw new AppError(
      "INTERNAL_ERROR",
      "No keywords to track. Add keywords to this domain first.",
    );
  }

  if (input.maxCostCredits != null) {
    const { costCredits } = estimateRankCheckCredits(
      keywords.map((kw) => kw.keyword),
      config.devices,
      config.serpDepth,
      rankCheckMethod("manual", input.validateSerps),
      input.validateSerps ? VALIDATED_CRAWLS_PER_PAIR : 1,
    );
    if (costCredits > input.maxCostCredits) {
      throw new AppError(
        "VALIDATION_ERROR",
        rankCheckCostApprovalError(costCredits, input.maxCostCredits),
      );
    }
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
    maxCostCredits: input.maxCostCredits,
    trigger: "manual",
    validateSerps: input.validateSerps,
    workflowStartErrorMessage: "Failed to start rank check workflow",
  });
}

// A scheduled check this close covers the same keywords, so an automatic
// check now would bill the customer twice within the hour.
const AUTO_CHECK_SCHEDULE_WINDOW_MS = 60 * 60_000;

// The check that follows adding a domain or keywords, as opposed to the user
// pressing "Check Now" — so it yields to an imminent scheduled check.
async function triggerAutoCheck(input: {
  configId: string;
  projectId: string;
  billingCustomer: BillingCustomerContext;
  keywordIds?: string[];
}): Promise<
  | RankCheckTriggerResult
  | { ok: false; reason: "scheduled_soon" | "no_keywords" }
> {
  const config = await getValidatedConfig(input.configId, input.projectId);
  const msUntilScheduled = config.nextCheckAt
    ? new Date(config.nextCheckAt).getTime() - Date.now()
    : Infinity;
  if (msUntilScheduled <= AUTO_CHECK_SCHEDULE_WINDOW_MS) {
    // A free plan must not be told to wait for a scheduled check that the
    // scheduler will skip. The other path checks access in triggerCheck.
    await requireRankCheckAccess(input.billingCustomer.organizationId);
    return { ok: false, reason: "scheduled_soon" };
  }
  // A brand-new domain has no keywords yet; a re-added archived one keeps its.
  const counts = await RankTrackingRepository.getKeywordCountsForConfigs([
    config.id,
  ]);
  if (!counts.get(config.id)) return { ok: false, reason: "no_keywords" };
  return triggerCheck(input);
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
  const config = await getValidatedConfig(configId, projectId);
  await requireRankCheckAccess(billingCustomer.organizationId);
  const keywords = await RankTrackingRepository.getKeywordsForConfig(configId);
  if (keywords.length === 0) return { updated: 0 };

  const client = createDataforseoClient(billingCustomer);
  const metrics = await fetchKeywordMetricsForList(client, {
    // The keyword-data APIs are case-insensitive and echo keywords back
    // lowercased, so ask in lowercase. A match-case keyword can sit next to
    // its lowercase twin; both then map to the same metrics row and the
    // request carries no duplicates.
    keywords: [...new Set(keywords.map((kw) => kw.keyword.toLowerCase()))],
    locationCode: config.locationCode,
    // Trackers can pair any SERP language with any country; the keyword-data
    // APIs only serve the country's own languages.
    languageCode: resolveKeywordDataLanguage(
      config.locationCode,
      config.languageCode,
    ),
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
// MCP/browser read models and access policy
// ---------------------------------------------------------------------------

async function getConfigs(projectId: string) {
  return RankTrackingRepository.getConfigsForProject(projectId);
}

async function getTracker(configId: string, projectId: string) {
  const config = await getValidatedConfig(configId, projectId);
  const results = await getLatestResults(configId, projectId);
  return { config, results };
}

async function getKeywordHistory(
  configId: string,
  projectId: string,
  trackingKeywordId: string,
  sinceDays: number,
) {
  const config = await getValidatedConfig(configId, projectId);
  const rows = await RankTrackingRepository.getKeywordHistory(
    configId,
    trackingKeywordId,
    sinceDays,
  );
  return { config, rows };
}

async function getConfigTrend(
  configId: string,
  projectId: string,
  device: "desktop" | "mobile",
  sinceDays: number,
) {
  const config = await getValidatedConfig(configId, projectId);
  const rows = await RankTrackingRepository.getConfigTrend(
    configId,
    device,
    sinceDays,
  );
  return { config, device, rows };
}

async function getPositionMatrix(
  configId: string,
  projectId: string,
  device: "desktop" | "mobile",
  runLimit: number,
) {
  const config = await getValidatedConfig(configId, projectId);
  const [rows, keywords] = await Promise.all([
    RankTrackingRepository.getPositionMatrix(configId, device, runLimit),
    RankTrackingRepository.getKeywordsForConfig(configId),
  ]);
  const names = new Map(
    keywords.map((keyword) => [keyword.id, keyword.keyword]),
  );
  return {
    config,
    device,
    rows: rows.map((row) => ({
      ...row,
      keyword: names.get(row.trackingKeywordId) ?? row.trackingKeywordId,
    })),
  };
}

async function requireRankCheckAccess(organizationId: string) {
  if (!(await isHostedServerAuthMode())) return;
  if (await customerHasPaidPlan(organizationId)) return;
  throw new AppError(
    "PAYMENT_REQUIRED",
    "Upgrade to the paid plan to run rank checks",
  );
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
    throw new AppError("NOT_FOUND", "Rank tracking config not found");
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
  deleteTracker,
  addKeywords: RankTrackingKeywordService.addKeywords,
  removeKeywords: RankTrackingKeywordService.removeKeywords,
  triggerCheck,
  triggerAutoCheck,
  getLatestRun,
  estimateCost: RankTrackingKeywordService.estimateCost,
  refreshKeywordMetrics,
  getConfigs,
  getTracker,
  getKeywordHistory,
  getConfigTrend,
  getPositionMatrix,
  requireRankCheckAccess,
};
