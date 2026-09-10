import { z } from "zod";
import { dataforseoPost } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  parseTaskItems,
  type DataforseoApiResponse,
  type DataforseoItemsTask,
} from "@/server/lib/dataforseo/envelope";

const countryDistributionSchema = z
  .object({
    country_iso_code: z.string().regex(/^[A-Z]{2}$/),
    search_volume: z.number().int().nonnegative(),
    percentage: z.number().nonnegative().max(100),
  })
  .passthrough();

const globalSearchVolumeItemSchema = z
  .object({
    keyword: z.string(),
    search_volume: z.number().int().nonnegative(),
    country_distribution: z
      .array(countryDistributionSchema)
      .nullable()
      .optional(),
  })
  .passthrough();

type DataforseoGlobalSearchVolumeItem = z.infer<
  typeof globalSearchVolumeItemSchema
>;

export type GlobalCountryDistributionRow = {
  countryIsoCode: string;
  searchVolume: number;
  percentage: number;
};

export type GlobalSearchVolumeRow = {
  keyword: string;
  searchVolume: number;
  countryDistribution: GlobalCountryDistributionRow[];
};

const GLOBAL_SEARCH_VOLUME_PATH =
  "/v3/keywords_data/clickstream_data/global_search_volume/live";

/**
 * Fetches clickstream-based worldwide search volume and its country
 * distribution. Unlike Labs keyword endpoints, this request intentionally has
 * no location or language: the provider's global endpoint aggregates all
 * available countries into one worldwide volume.
 */
export async function fetchGlobalSearchVolume(input: {
  keywords: string[];
}): Promise<DataforseoApiResponse<GlobalSearchVolumeRow[]>> {
  // DataForSEO's global Live endpoint accepts one task per request and up to
  // 1000 keywords in that task. The MCP schema owns the user-facing bounds.
  const response = await dataforseoPost<
    DataforseoItemsTask<DataforseoGlobalSearchVolumeItem>
  >(GLOBAL_SEARCH_VOLUME_PATH, [{ keywords: input.keywords }]);
  const task = assertOk(response);
  const items = parseTaskItems(
    "keywords-data-clickstream-global-search-volume-live",
    task,
    globalSearchVolumeItemSchema,
  );

  return {
    data: items.map((item) => ({
      keyword: item.keyword,
      searchVolume: item.search_volume,
      countryDistribution: (item.country_distribution ?? []).map((country) => ({
        countryIsoCode: country.country_iso_code,
        searchVolume: country.search_volume,
        percentage: country.percentage,
      })),
    })),
    billing: buildTaskBilling(task),
  };
}
