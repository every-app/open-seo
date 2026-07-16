import { AppError } from "@/server/lib/errors";
import {
  DEFAULT_LOCATION_CODE,
  getKeywordDataProvider,
  getLanguageOptions,
  isLanguageServedForLocation,
} from "@/shared/keyword-locations";

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
 * Guards Labs-backed callers against a language DataForSEO doesn't serve for
 * the chosen location. A mismatched pair (e.g. language_code="ru" for the
 * United States) is otherwise rejected as an opaque *charged* "Invalid Field:
 * 'language_code'." task failure, so validate the pair first (cost 0).
 */
export function assertLanguageForLocation(
  locationCode: number | undefined,
  languageCode: string | undefined,
) {
  if (languageCode == null) return;
  const resolvedLocation = locationCode ?? DEFAULT_LOCATION_CODE;
  if (isLanguageServedForLocation(resolvedLocation, languageCode)) return;
  throw new AppError(
    "VALIDATION_ERROR",
    `Language '${languageCode}' is not available for this location. Available: ${getLanguageOptions(
      resolvedLocation,
    )
      .map((option) => option.code)
      .join(", ")}.`,
  );
}
