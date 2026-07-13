import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import {
  getKeywordDataProvider,
  getLanguageOptions,
  isSupportedLanguageCode,
} from "@/shared/keyword-locations";

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

/**
 * Guards Labs-backed tools against a language DataForSEO doesn't serve for the
 * chosen location. A mismatched pair (e.g. language_code="ru" for the United
 * States) is otherwise rejected as an opaque *charged* "Invalid Field:
 * 'language_code'." task failure, so validate the pair first (cost 0). Only
 * Labs locations have authoritative per-location language lists; Google Ads
 * locations are left to the metering safety net.
 */
export function assertLanguageForLocation(
  locationCode: number | undefined,
  languageCode: string | undefined,
) {
  if (languageCode == null) return;
  const resolvedLocation = locationCode ?? DEFAULT_LOCATION_CODE;
  if (getKeywordDataProvider(resolvedLocation) !== "labs") return;
  const options = getLanguageOptions(resolvedLocation);
  if (!options.some((option) => option.code === languageCode)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Language '${languageCode}' is not available for this location. Available: ${options
        .map((option) => option.code)
        .join(", ")}.`,
    );
  }
}

export const languageCodeSchema = z
  .string()
  .refine(isSupportedLanguageCode, {
    message:
      "Unsupported language code. Use a supported code such as 'en', 'es', 'de', or 'fr'.",
  })
  .describe("Language code (e.g. 'en', 'es', 'fr'). Defaults to 'en'.");
