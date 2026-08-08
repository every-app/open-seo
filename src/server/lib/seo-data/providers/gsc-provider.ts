import type { SEODataProvider, SEODataRequest } from "../types";
import {
  ProviderUnsupportedError,
  ProviderUnavailableError,
} from "../errors";
import { getProviderFeatureFlags } from "../config";
import { GscService, GscNotConnectedError } from "@/server/features/gsc/services/GscService";
import { GscTokenError, GscApiError } from "@/server/lib/gscClient";

/**
 * Google Search Console provider — free first-party SEO data.
 *
 * Serves `search_console` data type for verified/authorized properties.
 * Uses the existing `GscService` which wraps the official GSC API.
 *
 * GSC is first-party data (the user's own verified properties), so there is
 * NO DataForSEO fallback for this data type.
 */
export function createGscProvider(): SEODataProvider {
  return {
    name: "gsc",

    supports(request: SEODataRequest): boolean {
      return request.dataType === "search_console";
    },

    async get(request: SEODataRequest): Promise<unknown> {
      const flags = await getProviderFeatureFlags();
      if (!flags.gscEnabled) {
        throw new ProviderUnavailableError(
          "gsc",
          "Google Search Console is not enabled (GOOGLE_SEARCH_CONSOLE_ENABLED=false)",
        );
      }

      // GSC requires a projectId in the constraints to resolve the connection
      const projectId = request.constraints?.projectId as string | undefined; // oxlint-disable-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
      if (!projectId) {
        throw new ProviderUnsupportedError(
          "gsc",
          request.dataType,
          "GSC provider requires projectId in constraints",
        );
      }

      try {
        const result = await GscService.getPerformance({
          projectId,
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- GSC union types narrowed by caller
          dimensions: (request.constraints?.dimensions as never) ?? ["query"],
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- GSC union types narrowed by caller
          dateRange: request.constraints?.dateRange as never,
          startDate: request.dateFrom,
          endDate: request.dateTo,
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- optional number
          rowLimit: request.constraints?.rowLimit as number | undefined,
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- optional number
          startRow: request.constraints?.startRow as number | undefined,
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- GSC union types narrowed by caller
          type: request.constraints?.type as never,
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- GSC union types narrowed by caller
          dataState: request.constraints?.dataState as never,
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- GSC union types narrowed by caller
          filters: request.constraints?.filters as never,
        });
        return result;
      } catch (error) {
        if (error instanceof GscNotConnectedError) {
          throw new ProviderUnavailableError(
            "gsc",
            `No GSC connection for project ${projectId}`,
          );
        }
        if (error instanceof GscTokenError) {
          throw new ProviderUnavailableError(
            "gsc",
            "GSC token could not be minted (grant revoked or expired)",
            error,
          );
        }
        if (error instanceof GscApiError && error.status === 429) {
          throw new ProviderUnavailableError(
            "gsc",
            "GSC rate limit reached",
            error,
          );
        }
        throw error;
      }
    },
  };
}