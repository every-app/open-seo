import { z } from "zod";
import {
  isSupportedLanguageCode,
  isSupportedLocationCode,
} from "@/shared/keyword-locations";

export const DEFAULT_LOCATION_CODE = 2840;

export const projectIdSchema = z
  .string()
  .min(1)
  .describe(
    "Required. The OpenSEO project ID to scope this call to. Get one from list_projects.",
  );

// Country codes only. DataForSEO rejects an unknown location_code with a 40501
// "Invalid Field" on every task it was sent with; agents guess codes, and the
// merged SERP read posts each guess three times. Cities and regions go through
// locationName, which the tools that take it validate separately.
export const locationCodeSchema = z
  .number()
  .int()
  .refine(isSupportedLocationCode, {
    message:
      "Unsupported location code. Use a country code such as 2840 (United States) or 2826 (United Kingdom); for a city or region, pass locationName from search_serp_locations where the tool accepts it.",
  })
  .describe(
    "DataForSEO country location code (e.g. 2840 United States, 2826 United Kingdom). Defaults to the project's default market (see list_projects; editable in project settings). See dataforseo.com/help-center/locations. Some countries (e.g. Iceland, 2352) are served from Google Ads data: keyword volume/CPC/trends work, but keyword difficulty, search intent, and domain analytics are unavailable.",
  );

export const languageCodeSchema = z
  .string()
  .refine(isSupportedLanguageCode, {
    message:
      "Unsupported language code. Use a supported code such as 'en', 'es', 'de', or 'fr'.",
  })
  .describe(
    "Language code (e.g. 'en', 'es', 'vi'). Defaults to the project's default market language (see list_projects).",
  );
