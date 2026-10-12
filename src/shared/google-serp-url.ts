import { getIsoCountryCode } from "@/shared/keyword-locations";

type SerpMarket = {
  locationCode: number;
  languageCode: string;
  locationName?: string | null;
};

/**
 * Google's `uule` location parameter: a base64 protobuf that carries the
 * canonical location name ("Austin,Texas,United States"). DataForSEO's
 * location_name uses the same canonical names.
 */
function encodeUule(canonicalName: string): string {
  const name = new TextEncoder().encode(canonicalName);
  // Protobuf varint length; two bytes cover any real location name.
  const n = name.length;
  const length = n < 0x80 ? [n] : [(n & 0x7f) | 0x80, n >> 7];
  const bytes = [0x08, 0x02, 0x10, 0x20, 0x22, ...length, ...name];
  return btoa(String.fromCharCode(...bytes));
}

/**
 * A google.com search URL for the SERP a rank check fetches: same keyword,
 * interface language, country, and city. `pws=0` turns off personalised
 * results. Google can still vary results by device, account, and time.
 */
export function googleSerpUrl(keyword: string, market: SerpMarket): string {
  const params = new URLSearchParams({
    q: keyword,
    hl: market.languageCode,
    gl: getIsoCountryCode(market.locationCode),
    pws: "0",
  });
  // URLSearchParams would escape the "w+" prefix that Google expects as is.
  const uule = market.locationName
    ? `&uule=w+${encodeURIComponent(encodeUule(market.locationName))}`
    : "";
  return `https://www.google.com/search?${params.toString()}${uule}`;
}
