import { z } from "zod";
import { isSupportedLanguageCode } from "@/shared/keyword-locations";

export const DEFAULT_LOCATION_CODE = 2840;

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
    "DataForSEO location code. Defaults to the project's default market (see list_projects; editable in project settings). See dataforseo.com/help-center/locations. Some countries (e.g. Iceland, 2352) are served from Google Ads data: keyword volume/CPC/trends work, but keyword difficulty, search intent, and domain analytics are unavailable.",
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
