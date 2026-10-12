import type { BillingCustomerContext } from "@/server/billing/subscription";
import type { CreditFeature } from "@/shared/billing-credit-features";
import { createDataforseoClient } from "@/server/lib/dataforseo";
import { fetchAdsSearchVolumeForKeywords } from "@/server/lib/dataforseo/keyword-metrics";
import { fetchSerpLocationsForCountry } from "@/server/lib/dataforseo/serp-locations";
import { AppError } from "@/server/lib/errors";
import {
  LOCATION_OPTIONS,
  formatLocationLabel,
  getIsoCountryCode,
} from "@/shared/keyword-locations";
import type { EnrichedKeyword } from "./helpers";
import { mapAdsKeywordItems } from "./research-data";

/**
 * Reject a location that is not a city, county, or region of the country
 * before any paid call runs. The registry is the same list the location
 * picker searches, so it also keeps postal codes out.
 */
export async function assertLocalResearchLocation(
  locationCode: number,
  locationName: string,
): Promise<void> {
  const locations = await fetchSerpLocationsForCountry(
    getIsoCountryCode(locationCode),
  );
  if (locations.some((location) => location.locationName === locationName)) {
    return;
  }
  const country =
    LOCATION_OPTIONS.find((option) => option.code === locationCode)?.label ??
    "this country";
  // The app shows a fixed message for this code; MCP callers get this one.
  throw new AppError(
    "UNKNOWN_LOCATION",
    `"${formatLocationLabel(locationName)}" is not a city, county, or region we can find in ${country}.`,
  );
}

/**
 * Replace each row's volume, trend, CPC, and competition with Google Ads
 * numbers for one city, county, or region. Keyword difficulty and intent stay
 * national: Labs only serves countries. A keyword Google Ads does not return
 * (collapsed close variants, or text Ads rejects) gets null metrics, never the
 * national numbers.
 */
export async function localizeResearchRows(
  rows: EnrichedKeyword[],
  params: {
    locationCode: number;
    locationName: string;
    languageCode: string;
    creditFeature?: CreditFeature;
  },
  billingCustomer: BillingCustomerContext,
): Promise<EnrichedKeyword[]> {
  // Research results cap at 500 rows, under the endpoint's 1,000 keyword
  // limit, so one call covers them.
  const items = await fetchAdsSearchVolumeForKeywords(
    createDataforseoClient(billingCustomer),
    { ...params, keywords: rows.map((row) => row.keyword) },
  );
  const localByKeyword = new Map(
    mapAdsKeywordItems(items).map((local) => [local.keyword, local]),
  );

  return rows.map((row) => {
    const local = localByKeyword.get(row.keyword);
    return {
      ...row,
      searchVolume: local?.searchVolume ?? null,
      trend: local?.trend ?? [],
      cpc: local?.cpc ?? null,
      competition: local?.competition ?? null,
    };
  });
}
