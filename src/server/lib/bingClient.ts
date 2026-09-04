import { z } from "zod";

import { getAuth } from "@/lib/auth";
import {
  BING_API_BASE,
  BING_OAUTH_PROVIDER_ID,
  decodeBingAccessToken,
} from "@/shared/bing";
import {
  BING_API_RESPONSE_MAX_BYTES,
  BING_HTTP_TIMEOUT_MS,
  BingResponseTooLargeError,
  readBingResponseText,
} from "@/server/lib/bingHttp";

/** A Bing Webmaster REST call returned a non-2xx status, or a 2xx body that
 *  wasn't the expected WCF `d` envelope. `status` drives user-facing messaging;
 *  for a malformed-but-2xx body it carries the HTTP status we actually saw. */
export class BingApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BingApiError";
  }
}

/** No fresh access token could be minted — the user revoked the grant, or the
 *  stored Bing grant expired. Mirrors GscTokenError. */
export class BingTokenError extends Error {
  public readonly code = "bing_reconnect_required" as const;

  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "BingTokenError";
  }
}

/** A verified/unverified property on the Bing account, from GetUserSites. */
type BingSite = {
  url: string;
  isVerified: boolean;
  /** Same value for every site on an account — the account identifier
   *  (`webmasteruid`), not a per-site secret. Doubles as a verification code,
   *  so never render it. */
  authenticationCode: string | null;
  dnsVerificationCode: string | null;
};

/** GetRankAndTrafficStats returns one row per day. Field names verified
 *  against the live API on 2026-07-25: `Date` (WCF, carrying a timezone
 *  offset), `Clicks`, `Impressions`, plus the `__type` marker every WCF
 *  payload has. Extra fields are tolerated and ignored. */
type BingRankAndTrafficStatsRow = {
  /** ISO 8601, or null if Bing sent something unparseable. */
  date: string | null;
  clicks: number;
  impressions: number;
};

type BingQueryStatsRow = {
  query: string;
  date: string | null;
  clicks: number;
  impressions: number;
  averageClickPosition: number;
  averageImpressionPosition: number;
};

type BingCrawlStatsRow = {
  date: string | null;
  allOtherCodes: number;
  blockedByRobotsTxt: number;
  code2xx: number;
  code301: number;
  code302: number;
  code4xx: number;
  code5xx: number;
  containsMalware: number;
  crawlErrors: number;
  crawledPages: number;
  inIndex: number;
  inLinks: number;
};

type BingLinkCount = {
  url: string;
  count: number;
};

type BingLinkCountsResult = {
  links: BingLinkCount[];
  totalPages: number;
};

/** WCF serialises dates as the literal string "/Date(1445558400000)/" —
 *  milliseconds since epoch, optionally with a "+HHMM"/"-HHMM" timezone offset
 *  which is informational only (the ms value is already UTC). Returns null for
 *  anything that isn't that exact shape. GetUserSites carries no dates, but
 *  GetRankAndTrafficStats does. */
const WCF_DATE_PATTERN = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/;

export function parseWcfDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const match = WCF_DATE_PATTERN.exec(value);
  if (!match) return null;
  const ms = Number(match[1]);
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date;
}

function messageForStatus(status: number): string {
  if (status === 401 || status === 403) {
    return "Bing Webmaster denied access (the connection was revoked, or this account has no verified permission). Reconnect Bing to continue.";
  }
  if (status === 429) {
    return "Bing Webmaster rate limit reached. Retry shortly.";
  }
  if (status === 404) {
    return "Bing Webmaster site not found. It may have been removed in Bing Webmaster Tools.";
  }
  return `Bing Webmaster API error (${status}). Retry shortly.`;
}

/** Every Bing JSON response wraps its payload under a top-level `d` key
 *  (WCF envelope). A body without `d` is an error, not an empty result — so the
 *  key must be present, though its value may legitimately be `null`/`[]`. */
const bingEnvelopeSchema = z
  .looseObject({ d: z.unknown() })
  .refine((value) => "d" in value, { message: "missing `d` envelope" });

const rankAndTrafficStatsRowSchema = z.looseObject({
  Date: z.unknown(),
  Clicks: z.number(),
  Impressions: z.number(),
});

const queryStatsRowSchema = z.looseObject({
  Query: z.string(),
  Date: z.unknown(),
  Clicks: z.number(),
  Impressions: z.number(),
  AvgClickPosition: z.number(),
  AvgImpressionPosition: z.number(),
});

const crawlStatsRowSchema = z.looseObject({
  Date: z.unknown(),
  AllOtherCodes: z.number(),
  BlockedByRobotsTxt: z.number(),
  Code2xx: z.number(),
  Code301: z.number(),
  Code302: z.number(),
  Code4xx: z.number(),
  Code5xx: z.number(),
  ContainsMalware: z.number(),
  CrawlErrors: z.number(),
  CrawledPages: z.number(),
  InIndex: z.number(),
  InLinks: z.number(),
});

const linkCountSchema = z.looseObject({
  Url: z.string(),
  Count: z.number(),
});

const linkCountsResultSchema = z.looseObject({
  Links: z.array(linkCountSchema),
  TotalPages: z.number().int().nonnegative(),
});

const bingSiteSchema = z.looseObject({
  Url: z.string(),
  IsVerified: z.boolean(),
  AuthenticationCode: z.string().nullish(),
  DnsVerificationCode: z.string().nullish(),
});

/** Free Bing Webmaster Tools client, modelled on createGscClient. It does NOT
 *  meter credits — Bing reads are first-party and free. Access tokens are
 *  minted (and refreshed) by Better Auth from the connector's stored
 *  bing-webmaster grant and sent as a Bearer header. */
export function createBingClient(opts: {
  userId: string;
  bingAccountId?: string;
}) {
  async function getToken(): Promise<string> {
    let result: { accessToken?: string } | undefined;
    try {
      // Headerless call: getAccessToken trusts body.userId when no request
      // session is present, and auto-refreshes via the genericOAuth provider.
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

  /** Perform the call, map HTTP errors, then unwrap and return the `d`
   *  payload. Callers validate the payload shape with zod. */
  async function request(
    url: string,
    init?: { method?: string; body?: unknown },
  ): Promise<unknown> {
    const token = await getToken();
    const hasBody = init?.body !== undefined;
    let response: Response;
    try {
      response = await fetch(url, {
        method: init?.method ?? "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
        },
        body: hasBody ? JSON.stringify(init?.body) : undefined,
        signal: AbortSignal.timeout(BING_HTTP_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      throw new BingApiError(
        timedOut ? 504 : 502,
        timedOut
          ? "Bing Webmaster API timed out. Retry shortly."
          : "Bing Webmaster API could not be reached. Retry shortly.",
      );
    }

    let body: string;
    try {
      body = await readBingResponseText(response, BING_API_RESPONSE_MAX_BYTES);
    } catch (error) {
      if (!(error instanceof BingResponseTooLargeError)) throw error;
      throw new BingApiError(
        502,
        "Bing Webmaster returned a response that was too large to process safely.",
      );
    }

    if (!response.ok) {
      throw new BingApiError(
        response.status,
        messageForStatus(response.status),
      );
    }
    let raw: unknown;
    try {
      raw = JSON.parse(body);
    } catch {
      raw = undefined;
    }
    const envelope = bingEnvelopeSchema.safeParse(raw);
    if (!envelope.success) {
      throw new BingApiError(
        response.status,
        "Bing Webmaster returned an unexpected response (missing the `d` envelope).",
      );
    }
    return envelope.data.d;
  }

  return {
    /** The connected Bing account's email. Bing publishes no userinfo
     *  endpoint, so unlike GSC this is read from a claim on the access token
     *  rather than fetched — no network call beyond minting the token. Returns
     *  null when the token carries no email claim. */
    async getConnectedEmail(): Promise<string | null> {
      const claims = decodeBingAccessToken(await getToken());
      return claims?.webmasteremail ?? null;
    },

    /** GetUserSites — the verified/unverified properties on the grant. */
    async listSites(): Promise<BingSite[]> {
      const payload = await request(`${BING_API_BASE}/GetUserSites`);
      const sites = z.array(bingSiteSchema).parse(payload);
      return sites.map((site) => ({
        url: site.Url,
        isVerified: site.IsVerified,
        authenticationCode: site.AuthenticationCode ?? null,
        dnsVerificationCode: site.DnsVerificationCode ?? null,
      }));
    },

    /** GetRankAndTrafficStats — daily site totals. siteUrl is passed verbatim
     *  as a query param. WCF `/Date(ms)/` values in each row are converted to
     *  ISO strings. */
    async getRankAndTrafficStats(
      siteUrl: string,
    ): Promise<BingRankAndTrafficStatsRow[]> {
      const payload = await request(
        `${BING_API_BASE}/GetRankAndTrafficStats?siteUrl=${encodeURIComponent(siteUrl)}`,
      );
      const rows = z.array(rankAndTrafficStatsRowSchema).parse(payload);
      return rows.map((row) => ({
        date: parseWcfDate(row.Date)?.toISOString() ?? null,
        clicks: row.Clicks,
        impressions: row.Impressions,
      }));
    },

    /** GetQueryStats — sampled keyword rows over Bing's native reporting
     *  window. Bing exposes no date-range or paging parameters for this
     *  endpoint. AvgClickPosition may be -1 when a row has no clicks. */
    async getQueryStats(siteUrl: string): Promise<BingQueryStatsRow[]> {
      const payload = await request(
        `${BING_API_BASE}/GetQueryStats?siteUrl=${encodeURIComponent(siteUrl)}`,
      );
      const rows = z.array(queryStatsRowSchema).parse(payload);
      return rows.map((row) => ({
        query: row.Query,
        date: parseWcfDate(row.Date)?.toISOString() ?? null,
        clicks: row.Clicks,
        impressions: row.Impressions,
        averageClickPosition: row.AvgClickPosition,
        averageImpressionPosition: row.AvgImpressionPosition,
      }));
    },

    /** GetCrawlStats — one daily crawl/index-health row over Bing's native
     *  reporting window (currently up to six months). */
    async getCrawlStats(siteUrl: string): Promise<BingCrawlStatsRow[]> {
      const payload = await request(
        `${BING_API_BASE}/GetCrawlStats?siteUrl=${encodeURIComponent(siteUrl)}`,
      );
      const rows = z.array(crawlStatsRowSchema).parse(payload);
      return rows.map((row) => ({
        date: parseWcfDate(row.Date)?.toISOString() ?? null,
        allOtherCodes: row.AllOtherCodes,
        blockedByRobotsTxt: row.BlockedByRobotsTxt,
        code2xx: row.Code2xx,
        code301: row.Code301,
        code302: row.Code302,
        code4xx: row.Code4xx,
        code5xx: row.Code5xx,
        containsMalware: row.ContainsMalware,
        crawlErrors: row.CrawlErrors,
        crawledPages: row.CrawledPages,
        inIndex: row.InIndex,
        inLinks: row.InLinks,
      }));
    },

    /** GetLinkCounts — inbound-link counts for the selected Bing property.
     *  Bing pages this endpoint with a zero-based signed 16-bit page number. */
    async getLinkCounts(
      siteUrl: string,
      page = 0,
    ): Promise<BingLinkCountsResult> {
      const payload = await request(
        `${BING_API_BASE}/GetLinkCounts?siteUrl=${encodeURIComponent(siteUrl)}&page=${page}`,
      );
      const parsed = linkCountsResultSchema.parse(payload);
      return {
        links: parsed.Links.map((link) => ({
          url: link.Url,
          count: link.Count,
        })),
        totalPages: parsed.TotalPages,
      };
    },
  };
}
