import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { getKeywordDataProvider } from "@/shared/keyword-locations";

export const DEFAULT_LOCATION_CODE = 2840;
export const DEFAULT_LANGUAGE_CODE = "en";

export const projectIdSchema = z
  .string()
  .min(1)
  .describe(
    "Required. The OpenSEO project ID to scope this call to. Get one from list_projects.",
  );

export const locationCodeSchema = z
  .number()
  .int()
  .positive()
  .describe(
    "DataForSEO location code. Defaults to 2840 (United States). See dataforseo.com/help-center/locations. Some countries (e.g. Iceland, 2352) are served from Google Ads data: keyword volume/CPC/trends work, but keyword difficulty, search intent, and domain analytics are unavailable.",
  );

/**
 * Guards Labs-backed tools (domain analytics) against locations we serve
 * from Google Ads keyword data only.
 */
export function assertLabsLocationCode(locationCode: number | undefined) {
  if (locationCode != null && getKeywordDataProvider(locationCode) !== "labs") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Domain analytics is not available for this country. Keyword research and rank tracking work; domain-level data is limited to DataForSEO Labs locations.",
    );
  }
}

export const languageCodeSchema = z
  .string()
  .min(2)
  .describe("Language code (e.g. 'en', 'es', 'fr'). Defaults to 'en'.");
