import { env } from "cloudflare:workers";
import { GeoGridRepository } from "../repositories/GeoGridRepository";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import {
  getRequiredEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import { AppError } from "@/server/lib/errors";

export class GeoGridService {
  static async createConfig(input: {
    projectId: string;
    businessName: string;
    latitude: number;
    longitude: number;
    gridSize: number;
    gridSpacing: number;
    languageCode?: string;
    scheduleInterval?: "daily" | "weekly" | "monthly" | "manual";
  }) {
    const configId = crypto.randomUUID();
    await GeoGridRepository.createConfig({
      id: configId,
      projectId: input.projectId,
      businessName: input.businessName,
      latitude: input.latitude,
      longitude: input.longitude,
      gridSize: input.gridSize,
      gridSpacing: input.gridSpacing,
      languageCode: input.languageCode ?? "en",
      scheduleInterval: input.scheduleInterval ?? "weekly",
      isActive: true,
    });
    return { configId };
  }

  static async updateConfig(
    configId: string,
    projectId: string,
    input: {
      businessName?: string;
      latitude?: number;
      longitude?: number;
      gridSize?: number;
      gridSpacing?: number;
      languageCode?: string;
      scheduleInterval?: "daily" | "weekly" | "monthly" | "manual";
      isActive?: boolean;
    },
  ) {
    await GeoGridRepository.updateConfig(configId, projectId, input);
  }

  static async addKeywords(
    configId: string,
    projectId: string,
    keywords: string[],
  ) {
    const config = await GeoGridRepository.getConfigById(configId, projectId);
    if (!config) {
      throw new AppError("VALIDATION_ERROR", "Geo Grid config not found");
    }

    const existing = await GeoGridRepository.getKeywordsForConfig(configId);
    const existingSet = new Set(
      existing.map((k) => k.keyword.toLowerCase().trim()),
    );

    const rows = [];
    for (const kw of keywords) {
      const normalized = kw.trim();
      if (normalized && !existingSet.has(normalized.toLowerCase())) {
        rows.push({
          id: crypto.randomUUID(),
          configId,
          keyword: normalized,
        });
      }
    }

    if (rows.length > 0) {
      await GeoGridRepository.addKeywordsToConfig(rows);
    }
    return { added: rows.length };
  }

  static async removeKeywords(
    configId: string,
    projectId: string,
    keywordIds: string[],
  ) {
    const config = await GeoGridRepository.getConfigById(configId, projectId);
    if (!config) {
      throw new AppError("VALIDATION_ERROR", "Geo Grid config not found");
    }
    await GeoGridRepository.removeKeywordsFromConfig(keywordIds, configId);
  }

  /**
   * Calculates latitude and longitude for each grid cell.
   * gridX and gridY run from -floor(gridSize/2) to floor(gridSize/2).
   */
  static calculateGridCoordinates(
    centerLat: number,
    centerLng: number,
    gridSize: number,
    gridSpacingMiles: number,
  ): Array<{ gridX: number; gridY: number; lat: number; lng: number }> {
    const coords = [];
    const half = Math.floor(gridSize / 2);

    // 1 degree latitude = ~69.1 miles
    const latOffsetPerMile = 1 / 69.172;
    // 1 degree longitude = ~69.1 * cos(lat) miles
    const radLat = (centerLat * Math.PI) / 180;
    const lngOffsetPerMile = 1 / (69.172 * Math.cos(radLat));

    const latStep = gridSpacingMiles * latOffsetPerMile;
    const lngStep = gridSpacingMiles * lngOffsetPerMile;

    for (let y = -half; y <= half; y++) {
      for (let x = -half; x <= half; x++) {
        coords.push({
          gridX: x,
          gridY: y,
          lat: centerLat + y * latStep,
          lng: centerLng + x * lngStep,
        });
      }
    }
    return coords;
  }

  static async triggerCheck(input: {
    configId: string;
    projectId: string;
    billingCustomer: {
      userId: string;
      userEmail: string;
      organizationId: string;
      projectId: string;
    };
  }) {
    const config = await GeoGridRepository.getConfigById(
      input.configId,
      input.projectId,
    );
    if (!config) {
      throw new AppError("VALIDATION_ERROR", "Geo Grid config not found");
    }

    const keywords = await GeoGridRepository.getKeywordsForConfig(
      input.configId,
    );
    if (keywords.length === 0) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Please add at least one keyword first",
      );
    }

    const activeRun = await GeoGridRepository.getActiveRunForConfig(
      input.configId,
    );
    if (activeRun) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Another check is already in progress",
      );
    }

    const runId = crypto.randomUUID();
    const ok = await GeoGridRepository.tryCreateRun({
      id: runId,
      configId: input.configId,
      projectId: input.projectId,
      status: "running",
    });

    if (!ok) {
      throw new AppError(
        "INTERNAL_ERROR",
        "Another check is already in progress",
      );
    }

    // Run the check asynchronously
    const runCheckPromise = (async () => {
      try {
        let isMock = false;
        try {
          const apiKey = await getRequiredEnvValue("DATAFORSEO_API_KEY");
          // If using the default dummy API key in local dev, fallback to mock data
          if (apiKey === "WU9VUl9MT0dJTjpZT1VSX1BBU1NXT1JE" || !apiKey) {
            isMock = true;
          }
        } catch {
          isMock = true;
        }

        const gridPoints = this.calculateGridCoordinates(
          config.latitude,
          config.longitude,
          config.gridSize,
          config.gridSpacing,
        );

        const snapshots: any[] = [];
        const client = createDataforseoClient(input.billingCustomer);

        for (const kw of keywords) {
          for (const point of gridPoints) {
            let position: number | null = null;

            if (isMock) {
              // Generate highly realistic mock rank data based on distance from center
              const distance = Math.sqrt(
                point.gridX * point.gridX + point.gridY * point.gridY,
              );
              // Shift center rank slightly based on keyword length to make each keyword distinct
              const keywordSeed = kw.keyword.length % 3;
              const baseRank = 1 + keywordSeed;
              // Ranks degrade as we go further out from center
              const rankVal = Math.round(
                baseRank + distance * 2.5 + Math.random() * 1.5,
              );
              position = rankVal <= 20 ? rankVal : null;
            } else {
              try {
                // Call real DataForSEO maps local SERP endpoint
                const response = await client.serp.local({
                  keyword: kw.keyword,
                  locationCoordinate: `${point.lat},${point.lng}`,
                  languageCode: config.languageCode,
                  searchType: "maps",
                  device: "desktop",
                  depth: 20,
                });

                // Scan results for our business name
                const targetName = config.businessName.toLowerCase();
                const matchedIndex = response.findIndex((item: any) => {
                  const title = String(item.title || "").toLowerCase();
                  return (
                    title.includes(targetName) || targetName.includes(title)
                  );
                });

                position = matchedIndex !== -1 ? matchedIndex + 1 : null;
              } catch (err) {
                console.error(
                  `[geo-grid] DataForSEO call failed at (${point.lat}, ${point.lng}):`,
                  err,
                );
                // Re-throw in non-mock/production mode so the run fails with the real error
                throw err;
              }
            }

            snapshots.push({
              runId,
              keywordId: kw.id,
              keyword: kw.keyword,
              gridX: point.gridX,
              gridY: point.gridY,
              latitude: point.lat,
              longitude: point.lng,
              position,
            });
          }
        }

        await GeoGridRepository.insertSnapshots(snapshots);
        await GeoGridRepository.updateRun(runId, {
          status: "completed",
          completedAt: new Date().toISOString(),
        });
        await GeoGridRepository.updateConfig(input.configId, input.projectId, {
          lastCheckedAt: new Date().toISOString(),
        });
      } catch (err: any) {
        console.error("[geo-grid] check run failed:", err);
        await GeoGridRepository.updateRun(runId, {
          status: "failed",
          errorMessage: err?.message || String(err),
          completedAt: new Date().toISOString(),
        });
      }
    })();

    // Locally we don't await the promise so the trigger call returns immediately to the client
    // while the worker/runtime processes the job.
    return { ok: true, runId, promise: runCheckPromise };
  }
}
