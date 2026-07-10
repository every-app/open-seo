import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  DEFAULT_LOCATION_CODE,
  LOCATION_OPTIONS,
  getKeywordDataProvider,
  getLanguageCode,
  getLanguageOptions,
  isSupportedLocationCode,
} from "@/shared/keyword-locations";

/**
 * Server-wide default market for tools that fall back when a call omits
 * locationCode/languageCode. Historically hardcoded to the United States;
 * a deployment serving another market (e.g. Vietnam) sets
 * `OPENSEO_DEFAULT_LOCATION_CODE` (and optionally
 * `OPENSEO_DEFAULT_LANGUAGE_CODE` — defaults to the location's native
 * language). Invalid values fall back to the US defaults with a loud log,
 * never an error: a typo must not take every default-market call down.
 */

type MarketDefaults = {
  locationCode: number;
  languageCode: string;
  label: string;
};

const US_DEFAULTS: MarketDefaults = {
  locationCode: DEFAULT_LOCATION_CODE,
  languageCode: "en",
  label: "United States",
};

let memo: Promise<MarketDefaults> | null = null;

export function getDefaultMarket(): Promise<MarketDefaults> {
  memo ??= resolveDefaultMarket();
  return memo;
}

/** Test hook: clears the module-level memo. */
export function resetDefaultMarketForTests(): void {
  memo = null;
}

async function resolveDefaultMarket(): Promise<MarketDefaults> {
  const rawLocation =
    (await getOptionalEnvValue("OPENSEO_DEFAULT_LOCATION_CODE")) || undefined;
  const rawLanguage =
    (await getOptionalEnvValue("OPENSEO_DEFAULT_LANGUAGE_CODE")) || undefined;
  if (rawLocation == null && rawLanguage == null) return US_DEFAULTS;

  const locationCode =
    rawLocation == null ? US_DEFAULTS.locationCode : Number(rawLocation);
  if (
    !Number.isInteger(locationCode) ||
    !isSupportedLocationCode(locationCode)
  ) {
    console.warn(
      `OPENSEO_DEFAULT_LOCATION_CODE="${rawLocation}" is not a supported DataForSEO location code; using ${US_DEFAULTS.locationCode} (United States)`,
    );
    return US_DEFAULTS;
  }

  const nativeLanguage = getLanguageCode(locationCode);
  let languageCode = rawLanguage ?? nativeLanguage;
  if (
    getKeywordDataProvider(locationCode) === "labs" &&
    !getLanguageOptions(locationCode).some(
      (option) => option.code === languageCode,
    )
  ) {
    console.warn(
      `OPENSEO_DEFAULT_LANGUAGE_CODE="${rawLanguage}" is not served for location ${locationCode}; using its native language "${nativeLanguage}"`,
    );
    languageCode = nativeLanguage;
  }

  const defaults: MarketDefaults = {
    locationCode,
    languageCode,
    label:
      LOCATION_OPTIONS.find((option) => option.code === locationCode)?.label ??
      String(locationCode),
  };
  console.info(JSON.stringify({ evt: "openseo_default_market", ...defaults }));
  return defaults;
}
