import { BING_WEBMASTER_API_BASE } from "@/shared/bing";
import { BingApiError, BingAuthError } from "./bingErrors";

export { BingApiError, BingAuthError } from "./bingErrors";

/** One verified site on the API key's Bing Webmaster account. */
export type BingSite = {
  Url: string;
};

/** `GetRankAndTrafficStats` row. Updated daily; Bing gives no start/end date
 *  params — it returns its own fixed rolling window. `Date` is Bing's
 *  `/Date(ms-offset)/` wire format, parsed by the report layer. */
export type BingRankAndTrafficStatsRow = {
  Date: string;
  Clicks: number;
  Impressions: number;
};

/** `GetQueryStats` row. Updated weekly (slower than traffic stats), one row
 *  per query per week Bing has data for. */
export type BingQueryStatsRow = {
  Query: string;
  Clicks: number;
  Impressions: number;
  AvgClickPosition: number;
  AvgImpressionPosition: number;
  Date: string;
};

/** `GetPageStats` row. */
export type BingPageStatsRow = {
  Query: string;
  Page: string;
};

function messageForStatus(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return "Bing Webmaster Tools rejected this API key.";
  }
  if (status === 404) {
    return "Bing Webmaster Tools site not found. It may have been removed from the account.";
  }
  return `Bing Webmaster Tools API error (${status}): ${body.slice(0, 300)}`;
}

/** Free Bing Webmaster Tools client, authenticated with a per-user API key
 *  (bing.com/webmasters -> Settings -> API Access -> Generate API Key). Unlike
 *  GSC there is no OAuth token to mint or refresh — the key is appended to
 *  every request and never rotates on our side. Like GSC this does NOT meter
 *  credits; Bing Webmaster data has no per-call cost. */
export function createBingWebmasterClient(opts: { apiKey: string }) {
  async function request<T>(
    method: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    const url = new URL(`${BING_WEBMASTER_API_BASE}/${method}`);
    url.searchParams.set("apikey", opts.apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), { method: "GET" });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (response.status === 401 || response.status === 403) {
        throw new BingAuthError();
      }
      throw new BingApiError(
        response.status,
        messageForStatus(response.status, body),
        body,
      );
    }
    const data: { d?: T } = await response.json();
    if (data.d === undefined) {
      throw new BingApiError(
        response.status,
        "Bing Webmaster Tools returned an unexpected response shape.",
      );
    }
    return data.d;
  }

  return {
    /** `GetUserSites` — every site verified on this API key's account. Also
     *  doubles as the credential check: an invalid key throws BingAuthError
     *  here before anything is stored. */
    async getUserSites(): Promise<BingSite[]> {
      return request<BingSite[]>("GetUserSites");
    },

    /** `GetRankAndTrafficStats` — daily clicks/impressions for the site over
     *  Bing's fixed rolling window (docs: includes Web, Chat, News, Images,
     *  Videos, Knowledge Panel since 2023-03-24). */
    async getRankAndTrafficStats(
      siteUrl: string,
    ): Promise<BingRankAndTrafficStatsRow[]> {
      return request<BingRankAndTrafficStatsRow[]>("GetRankAndTrafficStats", {
        siteUrl,
      });
    },

    /** `GetQueryStats` — per-query clicks/impressions/avg position, updated
     *  weekly. No paging or date filters on Bing's side. */
    async getQueryStats(siteUrl: string): Promise<BingQueryStatsRow[]> {
      return request<BingQueryStatsRow[]>("GetQueryStats", { siteUrl });
    },

    /** `GetPageStats` — pages Bing has indexed for the site. */
    async getPageStats(siteUrl: string): Promise<BingPageStatsRow[]> {
      return request<BingPageStatsRow[]>("GetPageStats", { siteUrl });
    },

    /** `GetQueryPageStats` — the pages ranking for one query. */
    async getQueryPageStats(
      siteUrl: string,
      query: string,
    ): Promise<BingPageStatsRow[]> {
      return request<BingPageStatsRow[]>("GetQueryPageStats", {
        siteUrl,
        query,
      });
    },
  };
}
