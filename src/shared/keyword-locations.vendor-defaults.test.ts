import { describe, expect, it } from "vitest";
import {
  LABS_LOCATION_OPTIONS,
  getLanguageCode,
  isLabsLocationCode,
} from "./keyword-locations";

/**
 * DataForSEO's own default language for each Labs location: the language with
 * the most keyword records, which is what Labs uses when a call omits
 * language_code. Snapshot of the free
 * GET /v3/dataforseo_labs/locations_and_languages, taken 2026-07-16.
 *
 * LOCATION_LANGUAGE is hand-maintained, so it can drift from what DataForSEO
 * actually serves — a drifted entry sends the wrong-language data for a
 * country without failing. Refresh this snapshot with:
 *
 *   curl -s https://api.dataforseo.com/v3/dataforseo_labs/locations_and_languages \
 *     -H "Authorization: Basic $DATAFORSEO_API_KEY" \
 *   | jq -r '.tasks[0].result | sort_by(.location_code)[]
 *       | "  \(.location_code): \"\(.available_languages | max_by(.keywords) | .language_code)\", // \(.location_name)"'
 *
 * Google-Ads-only countries are absent by design: Labs holds no data for them,
 * so their language has no vendor answer to check against.
 */
const VENDOR_DEFAULT_LANGUAGE: Record<number, string> = {
  2008: "sq", // Albania
  2012: "fr", // Algeria
  2024: "pt", // Angola
  2031: "az", // Azerbaijan
  2032: "es", // Argentina
  2036: "en", // Australia
  2040: "de", // Austria
  2048: "ar", // Bahrain
  2050: "bn", // Bangladesh
  2051: "hy", // Armenia
  2056: "nl", // Belgium
  2068: "es", // Bolivia
  2070: "bs", // Bosnia and Herzegovina
  2076: "pt", // Brazil
  2100: "bg", // Bulgaria
  2104: "en", // Myanmar (Burma)
  2116: "en", // Cambodia
  2120: "fr", // Cameroon
  2124: "en", // Canada
  2144: "en", // Sri Lanka
  2152: "es", // Chile
  2158: "zh-TW", // Taiwan
  2170: "es", // Colombia
  2188: "es", // Costa Rica
  2191: "hr", // Croatia
  2196: "el", // Cyprus
  2203: "cs", // Czechia
  2208: "da", // Denmark
  2218: "es", // Ecuador
  2222: "es", // El Salvador
  2233: "et", // Estonia
  2246: "fi", // Finland
  2250: "fr", // France
  2276: "de", // Germany
  2288: "en", // Ghana
  2300: "el", // Greece
  2320: "es", // Guatemala
  2344: "zh-TW", // Hong Kong
  2348: "hu", // Hungary
  2356: "en", // India
  2360: "id", // Indonesia
  2372: "en", // Ireland
  2376: "he", // Israel
  2380: "it", // Italy
  2384: "fr", // Cote d'Ivoire
  2392: "ja", // Japan
  2398: "ru", // Kazakhstan
  2400: "ar", // Jordan
  2404: "en", // Kenya
  2410: "ko", // South Korea
  2428: "lv", // Latvia
  2440: "lt", // Lithuania
  2458: "en", // Malaysia
  2470: "en", // Malta
  2484: "es", // Mexico
  2492: "fr", // Monaco
  2498: "ro", // Moldova
  2504: "ar", // Morocco
  2528: "nl", // Netherlands
  2554: "en", // New Zealand
  2558: "es", // Nicaragua
  2566: "en", // Nigeria
  2578: "nb", // Norway
  2586: "en", // Pakistan
  2591: "es", // Panama
  2600: "es", // Paraguay
  2604: "es", // Peru
  2608: "en", // Philippines
  2616: "pl", // Poland
  2620: "pt", // Portugal
  2642: "ro", // Romania
  2682: "ar", // Saudi Arabia
  2686: "fr", // Senegal
  2688: "sr", // Serbia
  2702: "en", // Singapore
  2703: "sk", // Slovakia
  2704: "vi", // Vietnam
  2705: "sl", // Slovenia
  2710: "en", // South Africa
  2724: "es", // Spain
  2752: "sv", // Sweden
  2756: "de", // Switzerland
  2764: "th", // Thailand
  2784: "en", // United Arab Emirates
  2788: "ar", // Tunisia
  2792: "tr", // Turkiye
  2804: "uk", // Ukraine
  2807: "mk", // North Macedonia
  2818: "ar", // Egypt
  2826: "en", // United Kingdom
  2840: "en", // United States
  2854: "fr", // Burkina Faso
  2858: "es", // Uruguay
  2862: "es", // Venezuela
};

describe("getLanguageCode vs DataForSEO's Labs defaults", () => {
  it("uses DataForSEO's default language for every Labs location", () => {
    const drifted = Object.entries(VENDOR_DEFAULT_LANGUAGE)
      .filter(([code, language]) => getLanguageCode(Number(code)) !== language)
      .map(
        ([code, language]) =>
          `${code}: ours=${getLanguageCode(Number(code))} vendor=${language}`,
      );
    expect(drifted).toEqual([]);
  });

  it("classifies every location DataForSEO serves from Labs as a Labs location", () => {
    const misclassified = Object.entries(VENDOR_DEFAULT_LANGUAGE)
      .filter(([code]) => !isLabsLocationCode(Number(code)))
      .map(([code, language]) => `${code}: vendor serves ${language} via Labs`);
    expect(misclassified).toEqual([]);
  });

  it("covers every Labs location we offer, so a new one can't skip the check", () => {
    const unverified = LABS_LOCATION_OPTIONS.filter(
      (option) => VENDOR_DEFAULT_LANGUAGE[option.code] == null,
    ).map((option) => `${option.code} ${option.label}`);
    expect(unverified).toEqual([]);
  });
});
