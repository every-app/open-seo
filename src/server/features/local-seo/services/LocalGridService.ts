import { env } from "cloudflare:workers";
import type { InferInsertModel } from "drizzle-orm";
import type {
  localBusinesses,
  localGridConfigs,
  localGridKeywords,
  localGridResults,
  localGridRunPoints,
} from "@/db/schema";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import { generateLocalGrid, toLocalGridSize } from "@/shared/local-seo";
import type {
  createLocalGridConfigSchema,
  LocalGridScanTriggerResult,
  LocalGridResultsResponse,
  updateLocalGridConfigSchema,
} from "@/types/schemas/local-seo";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { LocalGridRepository } from "../repositories/LocalGridRepository";
import type { z } from "zod";

type CreateInput = z.infer<typeof createLocalGridConfigSchema>;
type CreateServiceInput = CreateInput & {
  projectMarket: { languageCode: string };
};
type UpdateInput = z.infer<typeof updateLocalGridConfigSchema>;

function normalizeKeywords(keywords: string[]) {
  const unique = new Set<string>();
  for (const keyword of keywords) {
    const normalized = keyword.trim().toLowerCase();
    if (normalized) unique.add(normalized);
  }
  return [...unique];
}

export function computeNextLocalGridScanAt(
  interval: "manual" | "weekly" | "monthly",
  now = new Date(),
) {
  if (interval === "manual") return null;
  const next = new Date(now);
  if (interval === "weekly") {
    next.setUTCDate(next.getUTCDate() + 7);
  } else {
    const targetMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    const lastDayOfTargetMonth = new Date(
      Date.UTC(
        targetMonthStart.getUTCFullYear(),
        targetMonthStart.getUTCMonth() + 1,
        0,
      ),
    ).getUTCDate();
    next.setUTCDate(1);
    next.setUTCFullYear(targetMonthStart.getUTCFullYear());
    next.setUTCMonth(targetMonthStart.getUTCMonth());
    next.setUTCDate(Math.min(now.getUTCDate(), lastDayOfTargetMonth));
  }
  return next.toISOString();
}

function businessValues(
  projectId: string,
  business: CreateInput["business"],
  now: string,
): Omit<InferInsertModel<typeof localBusinesses>, "id"> {
  return {
    projectId,
    placeId: business.placeId ?? null,
    cid: business.cid ?? null,
    featureId: business.featureId ?? null,
    name: business.name,
    address: business.address ?? null,
    phone: business.phone ?? null,
    website: business.website ?? null,
    primaryCategory: business.primaryCategory ?? null,
    latitude: business.latitude,
    longitude: business.longitude,
    rating: business.rating ?? null,
    reviewCount: business.reviewCount ?? null,
    lastRefreshedAt: now,
    updatedAt: now,
  };
}

async function createConfig(input: CreateServiceInput) {
  const now = new Date().toISOString();
  const existingBusiness =
    await LocalGridRepository.findBusinessByStableIdentifiers({
      projectId: input.projectId,
      placeId: input.business.placeId,
      cid: input.business.cid,
      featureId: input.business.featureId,
    });
  const values = businessValues(input.projectId, input.business, now);
  const businessId = existingBusiness?.id ?? crypto.randomUUID();

  if (existingBusiness) {
    await LocalGridRepository.updateBusiness(
      existingBusiness.id,
      input.projectId,
      values,
    );
  }

  const configId = crypto.randomUUID();
  const keywords = normalizeKeywords(input.keywords);
  await LocalGridRepository.createConfig({
    business: existingBusiness ? undefined : { id: businessId, ...values },
    config: {
      id: configId,
      projectId: input.projectId,
      businessId,
      name: input.name,
      centerLatitude: input.centerLatitude ?? input.business.latitude,
      centerLongitude: input.centerLongitude ?? input.business.longitude,
      gridSize: input.gridSize,
      radiusMeters: input.radiusMeters,
      distanceUnit: input.distanceUnit,
      languageCode: input.projectMarket.languageCode,
      seDomain: input.seDomain ?? null,
      searchDepth: input.searchDepth,
      searchPlaces: input.searchPlaces,
      scheduleInterval: input.scheduleInterval,
      nextScanAt: computeNextLocalGridScanAt(input.scheduleInterval),
      updatedAt: now,
    },
    keywords: keywords.map((keyword) => ({
      id: crypto.randomUUID(),
      configId,
      keyword,
    })),
  });

  return { configId, businessId };
}

async function listConfigs(projectId: string) {
  return LocalGridRepository.listConfigs(projectId);
}

async function getConfig(configId: string, projectId: string) {
  const config = await LocalGridRepository.getConfig(configId, projectId);
  if (!config) throw new AppError("NOT_FOUND");
  return config;
}

async function updateConfig(input: UpdateInput) {
  const current = await getConfig(input.configId, input.projectId);
  const now = new Date().toISOString();
  const updates: Partial<InferInsertModel<typeof localGridConfigs>> = {
    updatedAt: now,
  };

  if (input.name !== undefined) updates.name = input.name;
  if (input.centerLatitude !== undefined)
    updates.centerLatitude = input.centerLatitude;
  if (input.centerLongitude !== undefined)
    updates.centerLongitude = input.centerLongitude;
  if (input.gridSize !== undefined) updates.gridSize = input.gridSize;
  if (input.radiusMeters !== undefined)
    updates.radiusMeters = input.radiusMeters;
  if (input.distanceUnit !== undefined)
    updates.distanceUnit = input.distanceUnit;
  if (input.languageCode !== undefined)
    updates.languageCode = input.languageCode;
  if (input.seDomain !== undefined) updates.seDomain = input.seDomain;
  if (input.searchDepth !== undefined) updates.searchDepth = input.searchDepth;
  if (input.searchPlaces !== undefined)
    updates.searchPlaces = input.searchPlaces;
  if (input.isActive !== undefined) updates.isActive = input.isActive;
  if (input.scheduleInterval !== undefined) {
    updates.scheduleInterval = input.scheduleInterval;
    updates.nextScanAt = computeNextLocalGridScanAt(input.scheduleInterval);
  } else if (input.isActive === false) {
    updates.nextScanAt = null;
  } else if (input.isActive === true && current.config.nextScanAt === null) {
    updates.nextScanAt = computeNextLocalGridScanAt(
      current.config.scheduleInterval,
    );
  }

  const keywords = input.keywords
    ? (normalizeKeywords(input.keywords).map((keyword) => ({
        id: crypto.randomUUID(),
        configId: input.configId,
        keyword,
      })) satisfies Array<InferInsertModel<typeof localGridKeywords>>)
    : undefined;

  await LocalGridRepository.updateConfig({
    configId: input.configId,
    projectId: input.projectId,
    updates,
    keywords,
  });
  return { success: true };
}

async function archiveConfig(configId: string, projectId: string) {
  await getConfig(configId, projectId);
  const archived = await LocalGridRepository.archiveConfig(
    configId,
    projectId,
    new Date().toISOString(),
  );
  if (!archived) throw new AppError("NOT_FOUND");
  return { success: true };
}

async function triggerScan(input: {
  configId: string;
  projectId: string;
  billingCustomer: BillingCustomerContext;
}): Promise<LocalGridScanTriggerResult> {
  const details = await getConfig(input.configId, input.projectId);
  if (!details.config.isActive) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Resume this map grid before scanning",
    );
  }
  if (details.keywords.length === 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Add at least one keyword before scanning",
    );
  }
  if (await isHostedServerAuthMode()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Hosted map grid scans are unavailable until credit reservation is enabled",
    );
  }

  const grid = generateLocalGrid({
    centerLatitude: details.config.centerLatitude,
    centerLongitude: details.config.centerLongitude,
    gridSize: toLocalGridSize(details.config.gridSize),
    radiusMeters: details.config.radiusMeters,
  });
  const runId = crypto.randomUUID();
  const inserted = await LocalGridRepository.tryCreateRun({
    id: runId,
    configId: input.configId,
    projectId: input.projectId,
    taskCount: grid.length * details.keywords.length,
  });
  if (!inserted) {
    const blocker = await LocalGridRepository.getActiveRun(input.configId);
    return {
      ok: false,
      reason: "already_running",
      blockingRunId: blocker?.id ?? null,
    };
  }

  try {
    const points = grid.map((point) => ({
      id: crypto.randomUUID(),
      runId,
      ...point,
    })) satisfies Array<InferInsertModel<typeof localGridRunPoints>>;
    const results = points.flatMap((point) =>
      details.keywords.map((keyword) => ({
        id: crypto.randomUUID(),
        runPointId: point.id,
        trackingKeywordId: keyword.id,
        keyword: keyword.keyword,
      })),
    ) satisfies Array<InferInsertModel<typeof localGridResults>>;

    await LocalGridRepository.insertRunPoints(points);
    await LocalGridRepository.insertRunResults(results);
    await env.LOCAL_GRID_WORKFLOW.create({
      id: runId,
      params: {
        runId,
        configId: input.configId,
        projectId: input.projectId,
        billingCustomer: {
          userId: input.billingCustomer.userId,
          userEmail: input.billingCustomer.userEmail,
          organizationId: input.billingCustomer.organizationId,
          projectId: input.billingCustomer.projectId,
        },
        languageCode: details.config.languageCode,
        seDomain: details.config.seDomain,
        searchDepth: details.config.searchDepth,
        searchPlaces: details.config.searchPlaces,
        target: {
          placeId: details.business.placeId,
          cid: details.business.cid,
          featureId: details.business.featureId,
        },
      },
    });
    return { ok: true, runId };
  } catch (error) {
    await LocalGridRepository.updateRun(runId, {
      status: "failed",
      errorMessage: "Failed to start map grid workflow",
      completedAt: new Date().toISOString(),
    });
    try {
      const instance = await env.LOCAL_GRID_WORKFLOW.get(runId);
      await instance.terminate();
    } catch {
      // The workflow may not have been created.
    }
    throw error;
  }
}

async function getResults(
  configId: string,
  projectId: string,
): Promise<LocalGridResultsResponse> {
  const details = await getConfig(configId, projectId);
  const run = await LocalGridRepository.getLatestRun(configId);
  if (!run) {
    return {
      gridSize: details.config.gridSize,
      run: null,
      keywords: details.keywords.map(({ id, keyword }) => ({ id, keyword })),
      cells: [],
    };
  }

  const cells = await LocalGridRepository.getRunGridResults(run.id);
  const runKeywords = new Map<string, string>();
  let gridSize = 0;
  for (const cell of cells) {
    runKeywords.set(cell.trackingKeywordId, cell.keyword);
    gridSize = Math.max(gridSize, cell.rowIndex + 1, cell.columnIndex + 1);
  }
  return {
    gridSize: gridSize || details.config.gridSize,
    run: {
      id: run.id,
      status: run.status,
      taskCount: run.taskCount,
      tasksCompleted: run.tasksCompleted,
      providerCostUsd: run.providerCostUsd,
      errorMessage: run.errorMessage,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    },
    keywords:
      runKeywords.size > 0
        ? [...runKeywords].map(([id, keyword]) => ({ id, keyword }))
        : details.keywords.map(({ id, keyword }) => ({ id, keyword })),
    cells,
  };
}

export const LocalGridService = {
  createConfig,
  listConfigs,
  getConfig,
  updateConfig,
  archiveConfig,
  triggerScan,
  getResults,
};
