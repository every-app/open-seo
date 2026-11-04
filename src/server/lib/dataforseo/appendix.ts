import { z } from "zod";
import { dataforseoGet, dataforseoPost } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  type DataforseoTaskLike,
} from "@/server/lib/dataforseo/envelope";

const gotoConversionsSchema = z.array(
  z.object({ goto: z.string(), url: z.string().url().nullish() }),
);

/** DataForSEO's limit for one goto_url_converter request. */
export const MAX_GOTO_URLS_PER_REQUEST = 100;

/**
 * The real page behind each google.com/goto URL, keyed by that URL. A URL
 * DataForSEO couldn't resolve is left out. POST /v3/appendix/goto_url_converter
 * is free, so like fetchUserData this is deliberately not metered.
 */
export async function resolveGotoUrls(
  gotoUrls: string[],
): Promise<Map<string, string>> {
  const task = assertOk(
    await dataforseoPost("/v3/appendix/goto_url_converter", [
      { goto_urls: gotoUrls },
    ]),
  );
  return new Map(
    gotoConversionsSchema
      .parse(task.result ?? [])
      .flatMap(({ goto, url }) => (url ? [[goto, url] as const] : [])),
  );
}

/**
 * Account snapshot from the free GET /v3/appendix/user_data. Every field is
 * optional on the wire; `money.statistics.day` / `.minute` group spend by
 * function under `total_<function>` keys, so those stay untyped records.
 */
interface DataforseoUserData {
  login?: string | null;
  timezone?: string | null;
  money?: {
    total?: number | null;
    balance?: number | null;
    statistics?: {
      day?: Record<string, unknown> | null;
      minute?: Record<string, unknown> | null;
      [key: string]: unknown;
    } | null;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

/**
 * Reads account spend + balance from DataForSEO's free GET
 * /v3/appendix/user_data. This is the standard, non-billable way to inspect
 * cost — unlike the other billing scripts, it does NOT make a live billable
 * call to observe spend, so there is nothing to meter and it is deliberately
 * NOT wired through meterDataforseoCall / client.ts.
 *
 * The result carries `money.total` (lifetime deposited), `money.balance`
 * (remaining), and `money.statistics.day` / `.minute` — spend grouped by
 * function (serp, keywords_data, backlinks, dataforseo_labs, on_page,
 * business_data, …) for the rolling day / minute window.
 */
export async function fetchUserData(): Promise<DataforseoUserData | undefined> {
  const response = await dataforseoGet<
    DataforseoTaskLike & { result?: DataforseoUserData[] }
  >("/v3/appendix/user_data");

  // Validates top-level + task status; the call is free so there is no billing
  // envelope to build.
  const task = assertOk(response);

  return task.result?.[0];
}
