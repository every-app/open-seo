import { z } from "zod";

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
    "DataForSEO location code. Defaults to 2840 (United States). See dataforseo.com/help-center/locations.",
  );

export const languageCodeSchema = z
  .string()
  .min(2)
  .describe("Language code (e.g. 'en', 'es', 'fr'). Defaults to 'en'.");
