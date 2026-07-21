import type { AppendixUserDataResultInfo } from "dataforseo-client";
import { appendixApi } from "@/server/lib/dataforseo/core";
import { assertOk } from "@/server/lib/dataforseo/envelope";

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
 *
 * SDK types are loose (every field optional + index signatures), so callers
 * must optional-chain into `.money.statistics.day`; it can be undefined.
 */
export async function fetchUserData(): Promise<
  AppendixUserDataResultInfo | undefined
> {
  const response = await appendixApi().userData();

  // Validates top-level + task status; the call is free so there is no billing
  // envelope to build.
  const task = assertOk(response);

  return task.result?.[0];
}
