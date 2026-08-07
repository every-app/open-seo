import { getAuth } from "@/lib/auth";
import { BING_OAUTH_PROVIDER_ID } from "@/shared/bing";

const BING_API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

/** A Bing Webmaster REST call returned a non-2xx status. */
export class BingApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "BingApiError";
  }
}

/** No fresh access token could be minted for an OAuth-backed connection. */
export class BingTokenError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "BingTokenError";
  }
}

export type BingSite = Record<string, unknown> & {
  url?: string;
  siteUrl?: string;
};

export type BingVisibility = Record<string, unknown> | unknown[];
export type BingCrawlIssue = Record<string, unknown>;

function messageForStatus(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return "Bing Webmaster denied access to this property (no verified permission, or the connection was revoked).";
  }
  if (status === 429) {
    return "Bing Webmaster rate limit reached. Retry shortly.";
  }
  if (status === 404) {
    return "Bing Webmaster property not found. It may have been removed from Bing Webmaster Tools.";
  }
  return `Bing Webmaster API error (${status}): ${body.slice(0, 300)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record: Record<string, unknown> = {};
  for (const key of Object.keys(value)) record[key] = Reflect.get(value, key);
  return record;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Bing's legacy Webmaster API wraps responses in OData's `d` property. Some
 * endpoints further wrap collections in `results` or `value`; normalize only
 * those transport envelopes and preserve provider row fields verbatim. */
function unwrapResponse(value: unknown): unknown {
  const root = asRecord(value);
  const data = root && "d" in root ? root.d : value;
  const record = asRecord(data);
  if (!record) return data;
  if (Array.isArray(record.results)) return record.results;
  if (Array.isArray(record.value)) return record.value;
  return data;
}

export function getBingSiteUrl(site: BingSite): string | null {
  for (const key of ["siteUrl", "url", "Url", "SiteUrl"] as const) {
    const value = site[key];
    if (typeof value === "string") return value;
  }
  return null;
}

export function createBingClient(opts: {
  userId?: string;
  bingAccountId?: string;
  apiKey?: string;
}) {
  async function getToken(): Promise<string> {
    if (!opts.userId) {
      throw new BingTokenError(
        "No Bing Webmaster OAuth user is configured for this connection.",
      );
    }

    let result: { accessToken?: string } | undefined;
    try {
      result = await getAuth().api.getAccessToken({
        body: {
          providerId: BING_OAUTH_PROVIDER_ID,
          userId: opts.userId,
          ...(opts.bingAccountId ? { accountId: opts.bingAccountId } : {}),
        },
      });
    } catch (error) {
      throw new BingTokenError(
        "Could not mint a Bing Webmaster access token (grant revoked or expired).",
        error,
      );
    }
    if (!result?.accessToken) {
      throw new BingTokenError(
        "Bing Webmaster returned no access token (grant revoked or expired).",
      );
    }
    return result.accessToken;
  }

  async function request(
    endpoint: string,
    params?: Record<string, string | number | undefined>,
  ): Promise<unknown> {
    const url = new URL(`${BING_API_BASE}/${endpoint}`);
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (opts.apiKey) {
      // The self-hosted fallback is the API-key flow documented by Bing. Keep
      // the key in the query string because that is what the Webmaster API
      // accepts; it is never included in returned structured content.
      url.searchParams.set("apikey", opts.apiKey);
    } else {
      headers.Authorization = `Bearer ${await getToken()}`;
    }

    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new BingApiError(
        response.status,
        messageForStatus(response.status, body),
        body,
      );
    }

    return unwrapResponse(await response.json());
  }

  return {
    /** Bing Webmaster API `GetUserSites`. */
    async listSites(): Promise<BingSite[]> {
      const data = await request("GetUserSites");
      if (!isUnknownArray(data)) return [];
      return data.filter((site): site is BingSite => asRecord(site) !== null);
    },

    /** Bing Webmaster API `GetRankAndTrafficStats`, surfaced as visibility. */
    async getVisibility(siteUrl: string): Promise<BingVisibility> {
      const data = await request("GetRankAndTrafficStats", { siteUrl });
      if (isUnknownArray(data)) return data;
      return asRecord(data) ?? {};
    },

    /** Alias matching Bing's endpoint name for callers that need the raw API. */
    async getRankAndTrafficStats(siteUrl: string): Promise<BingVisibility> {
      const data = await request("GetRankAndTrafficStats", { siteUrl });
      if (isUnknownArray(data)) return data;
      return asRecord(data) ?? {};
    },

    async getQueryStats(siteUrl: string): Promise<unknown[]> {
      const data = await request("GetQueryStats", { siteUrl });
      return isUnknownArray(data) ? data : [];
    },

    async getPageStats(siteUrl: string): Promise<unknown[]> {
      const data = await request("GetPageStats", { siteUrl });
      return isUnknownArray(data) ? data : [];
    },

    /** Bing Webmaster API `GetCrawlIssues`. */
    async getCrawlIssues(siteUrl: string): Promise<BingCrawlIssue[]> {
      const data = await request("GetCrawlIssues", { siteUrl });
      if (!isUnknownArray(data)) return [];
      return data.filter(
        (issue): issue is BingCrawlIssue => asRecord(issue) !== null,
      );
    },
  };
}
