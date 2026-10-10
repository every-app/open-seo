import { z } from "zod";
import { BING_WEBMASTER_API_BASE } from "@/shared/bing";
import { BingApiError, BingAuthError, BingThrottleError } from "./bingErrors";

export { BingApiError, BingAuthError, BingThrottleError } from "./bingErrors";

/** Bing answers a throttled IP with HTTP 400 and ErrorCode 17 ("ThrottleIP").
 *  Match the body, not the status — 400 is also Bing's generic bad-request. */
function isThrottled(body: string): boolean {
  return /"ErrorCode"\s*:\s*17\b/.test(body) || /ThrottleIP/i.test(body);
}

/** Bing flags a dead credential in the body; ErrorCode 18 ("InvalidToken") is
 *  the expired/invalid case, and it arrives as HTTP 400 rather than 401. */
function isAuthFailure(body: string): boolean {
  return /InvalidToken|InvalidApiKey|InvalidKey|Unauthorized/i.test(body);
}

/** A site on the connected Bing Webmaster account, from `GetUserSites`. */
export type BingSite = {
  url: string;
  isVerified: boolean;
};

/** One query- or page-level traffic row, normalized from Bing's per-day rows.
 *  `key` is the query or page; `date` is present when Bing returned a day. */
export type BingPerfRow = {
  key: string;
  date?: string;
  clicks: number;
  impressions: number;
  /** Average impression position (1-based), from Bing's
   *  `AvgImpressionPosition`. Omitted when Bing reports its -1 sentinel. */
  position?: number;
};

/** One day of site-level traffic, from `GetRankAndTrafficStats`. This is Bing's
 *  authoritative whole-site total — unlike the top-queries / top-pages reports,
 *  which each return only their own top-N subset. */
export type BingTrafficRow = {
  date: string;
  clicks: number;
  impressions: number;
};

/** One day of crawl/index counts, from `GetCrawlStats`. */
export type BingCrawlStat = {
  date: string;
  crawledPages: number;
  inIndex: number;
  crawlErrors: number;
  code2xx: number;
  code301: number;
  code302: number;
  code4xx: number;
  code5xx: number;
  blockedByRobotsTxt: number;
  dnsFailures: number;
  connectionTimeout: number;
  containsMalware: number;
  inLinks: number;
};

/** One URL Bing reports a crawl issue for, from `GetCrawlIssues`. `issues` is
 *  Bing's `CrawlIssues` flags enum as a bitmask; Bing does not document the
 *  bits, so it is passed through rather than decoded. */
export type BingCrawlIssue = {
  url: string;
  httpCode?: number;
  inLinks?: number;
  issues: number;
};

/** Crawl details for one URL, from `GetUrlInfo`. A typed subset of Bing's
 *  `UrlInfo`; Bing documents no indexing-status, robots-directive, or
 *  content-changed property. */
export type BingUrlInfo = {
  url: string;
  /** False when Bing reported no HTTP status (it uses 0 as a sentinel). */
  httpStatusReported: boolean;
  httpStatus?: number;
  isPage?: boolean;
  lastCrawledDate?: string;
  discoveryDate?: string;
  documentSize?: number;
  anchorCount?: number;
  totalChildUrlCount?: number;
};

// Bing's JSON/HTTP API wraps its payload in `{ d: ... }`. Field names are
// PascalCase, but tolerate lowercase for resilience across method variants.
const envelopeSchema = z.looseObject({
  d: z.unknown().optional(),
});

const siteSchema = z.looseObject({
  Url: z.string().optional(),
  url: z.string().optional(),
  IsVerified: z.boolean().optional(),
  isVerified: z.boolean().optional(),
});

const perfRowSchema = z.looseObject({
  Query: z.string().optional(),
  Page: z.string().optional(),
  Url: z.string().optional(),
  query: z.string().optional(),
  page: z.string().optional(),
  Date: z.string().optional(),
  Clicks: z.number().optional(),
  Impressions: z.number().optional(),
  AvgClickPosition: z.number().optional(),
  AvgImpressionPosition: z.number().optional(),
});

const trafficRowSchema = z.looseObject({
  Date: z.string().optional(),
  Clicks: z.number().optional(),
  Impressions: z.number().optional(),
});

const crawlStatSchema = z.looseObject({
  Date: z.string().optional(),
  CrawledPages: z.number().optional(),
  InIndex: z.number().optional(),
  CrawlErrors: z.number().optional(),
  Code2xx: z.number().optional(),
  Code301: z.number().optional(),
  Code302: z.number().optional(),
  Code4xx: z.number().optional(),
  Code5xx: z.number().optional(),
  BlockedByRobotsTxt: z.number().optional(),
  DnsFailures: z.number().optional(),
  ConnectionTimeout: z.number().optional(),
  ContainsMalware: z.number().optional(),
  InLinks: z.number().optional(),
});

const crawlIssueSchema = z.looseObject({
  Url: z.string().optional(),
  url: z.string().optional(),
  HttpCode: z.number().optional(),
  InLinks: z.number().optional(),
  Issues: z.number().optional(),
});

const urlInfoSchema = z.looseObject({
  Url: z.string().optional(),
  HttpStatus: z.number().optional(),
  IsPage: z.boolean().optional(),
  LastCrawledDate: z.string().optional(),
  DiscoveryDate: z.string().optional(),
  DocumentSize: z.number().optional(),
  AnchorCount: z.number().optional(),
  TotalChildUrlCount: z.number().optional(),
});

/** Bing serializes dates as WCF `/Date(ms)/`; normalize to `YYYY-MM-DD`. */
function decodeBingDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = /\/Date\((\d+)/.exec(value);
  if (!match) return value;
  const ms = Number(match[1]);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString().slice(0, 10);
}

function parseSite(row: unknown): BingSite | null {
  const parsed = siteSchema.safeParse(row);
  if (!parsed.success) return null;
  const url = parsed.data.Url ?? parsed.data.url;
  if (!url) return null;
  return {
    url,
    isVerified: parsed.data.IsVerified ?? parsed.data.isVerified ?? false,
  };
}

function parsePerfRow(row: unknown): BingPerfRow | null {
  const parsed = perfRowSchema.safeParse(row);
  if (!parsed.success) return null;
  const data = parsed.data;
  const key =
    data.Query ?? data.Page ?? data.Url ?? data.query ?? data.page ?? null;
  if (!key) return null;
  const date = decodeBingDate(data.Date);
  // Position is the average position of *impressions* — a plain 1-based number
  // (Bing reports AvgClickPosition as -1 whenever the key got no clicks, which
  // is most of the long tail, so it is useless as a position). Both fields use
  // -1 as "not reported"; drop it rather than pass it through.
  const rawPosition = data.AvgImpressionPosition;
  return {
    key,
    ...(date ? { date } : {}),
    clicks: data.Clicks ?? 0,
    impressions: data.Impressions ?? 0,
    ...(rawPosition === undefined || rawPosition <= 0
      ? {}
      : { position: rawPosition }),
  };
}

function parseTrafficRow(row: unknown): BingTrafficRow | null {
  const parsed = trafficRowSchema.safeParse(row);
  if (!parsed.success) return null;
  const date = decodeBingDate(parsed.data.Date);
  if (!date) return null;
  return {
    date,
    clicks: parsed.data.Clicks ?? 0,
    impressions: parsed.data.Impressions ?? 0,
  };
}

function parseCrawlStat(row: unknown): BingCrawlStat | null {
  const parsed = crawlStatSchema.safeParse(row);
  if (!parsed.success) return null;
  const date = decodeBingDate(parsed.data.Date);
  if (!date) return null;
  const d = parsed.data;
  return {
    date,
    crawledPages: d.CrawledPages ?? 0,
    inIndex: d.InIndex ?? 0,
    crawlErrors: d.CrawlErrors ?? 0,
    code2xx: d.Code2xx ?? 0,
    code301: d.Code301 ?? 0,
    code302: d.Code302 ?? 0,
    code4xx: d.Code4xx ?? 0,
    code5xx: d.Code5xx ?? 0,
    blockedByRobotsTxt: d.BlockedByRobotsTxt ?? 0,
    dnsFailures: d.DnsFailures ?? 0,
    connectionTimeout: d.ConnectionTimeout ?? 0,
    containsMalware: d.ContainsMalware ?? 0,
    inLinks: d.InLinks ?? 0,
  };
}

function parseCrawlIssue(row: unknown): BingCrawlIssue | null {
  const parsed = crawlIssueSchema.safeParse(row);
  if (!parsed.success) return null;
  const d = parsed.data;
  const url = d.Url ?? d.url;
  if (!url) return null;
  return {
    url,
    ...(d.HttpCode === undefined ? {} : { httpCode: d.HttpCode }),
    ...(d.InLinks === undefined ? {} : { inLinks: d.InLinks }),
    issues: d.Issues ?? 0,
  };
}

function parseUrlInfo(row: unknown, fallbackUrl: string): BingUrlInfo | null {
  const parsed = urlInfoSchema.safeParse(row);
  if (!parsed.success) return null;
  const data = parsed.data;
  // Bing uses 0 as "no status reported"; a real HTTP status is never 0.
  const reported = data.HttpStatus !== undefined && data.HttpStatus > 0;
  const lastCrawledDate = decodeBingDate(data.LastCrawledDate);
  const discoveryDate = decodeBingDate(data.DiscoveryDate);
  return {
    url: data.Url ?? fallbackUrl,
    httpStatusReported: reported,
    ...(reported ? { httpStatus: data.HttpStatus } : {}),
    ...(data.IsPage === undefined ? {} : { isPage: data.IsPage }),
    ...(lastCrawledDate === undefined ? {} : { lastCrawledDate }),
    ...(discoveryDate === undefined ? {} : { discoveryDate }),
    ...(data.DocumentSize === undefined
      ? {}
      : { documentSize: data.DocumentSize }),
    ...(data.AnchorCount === undefined
      ? {}
      : { anchorCount: data.AnchorCount }),
    ...(data.TotalChildUrlCount === undefined
      ? {}
      : { totalChildUrlCount: data.TotalChildUrlCount }),
  };
}

function messageForStatus(status: number, body: string): string {
  if (status === 404) {
    return "Bing Webmaster site not found. It may have been removed in Bing Webmaster Tools.";
  }
  if (status === 429) {
    return "Bing Webmaster rate limit reached. Retry shortly.";
  }
  return `Bing Webmaster API error (${status}): ${body.slice(0, 300)}`;
}

/** Free Bing Webmaster Tools client. Like the Search Console client it does NOT
 *  meter credits — Bing is first-party data with no per-call cost. Accepts
 *  either a per-user API key (sent as the `apikey` query param) or a delegated
 *  OAuth access token (sent as a Bearer token). Both use Bing's `ssl` API host:
 *  Bing documents `www` for OAuth but Cloudflare Workers egress is challenged on
 *  `www`'s web front door, while `ssl` (the documented API host, and the one the
 *  API-key flow already uses) accepts the same Bearer token. Secrets arrive
 *  already decrypted and are never logged. */
export function createBingClient(
  opts: { apiKey: string } | { accessToken: string },
) {
  const base = BING_WEBMASTER_API_BASE;
  const headers =
    "accessToken" in opts
      ? { Authorization: `Bearer ${opts.accessToken}` }
      : undefined;
  const apiKey = "apiKey" in opts ? opts.apiKey : undefined;

  async function request(
    method: string,
    params: Record<string, string> = {},
  ): Promise<unknown> {
    const url = new URL(`${base}/${method}`);
    if (apiKey !== undefined) {
      url.searchParams.set("apikey", apiKey);
    }
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    const response = await fetch(
      url.toString(),
      headers ? { headers } : undefined,
    );
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (isThrottled(body)) {
        throw new BingThrottleError(response.status, body);
      }
      // Bing reports a dead credential as 401/403, but an expired or invalid
      // token also arrives as 400 with ErrorCode 18 ("InvalidToken"), so the
      // status alone is not enough to tell auth failures from bad requests.
      if (
        response.status === 401 ||
        response.status === 403 ||
        isAuthFailure(body)
      ) {
        throw new BingAuthError(
          "Bing rejected this credential (invalid, revoked, or missing permission).",
        );
      }
      throw new BingApiError(
        response.status,
        messageForStatus(response.status, body),
        body,
      );
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new BingApiError(
        response.status,
        "Bing returned a malformed response.",
      );
    }
    const parsed = envelopeSchema.safeParse(json);
    if (!parsed.success) {
      throw new BingApiError(
        response.status,
        "Bing returned a malformed response.",
      );
    }
    return parsed.data.d;
  }

  return {
    /** `GetUserSites` — every site verified on the key's Bing account. */
    async listSites(): Promise<BingSite[]> {
      const data = await request("GetUserSites");
      const rows = Array.isArray(data) ? data : [];
      return rows
        .map(parseSite)
        .filter((site): site is BingSite => site !== null);
    },

    /** `GetQueryStats` — per-query, per-day traffic for a site. */
    async queryStats(siteUrl: string): Promise<BingPerfRow[]> {
      const data = await request("GetQueryStats", { siteUrl });
      const rows = Array.isArray(data) ? data : [];
      return rows
        .map(parsePerfRow)
        .filter((row): row is BingPerfRow => row !== null);
    },

    /** `GetPageStats` — per-page, per-day traffic for a site. */
    async pageStats(siteUrl: string): Promise<BingPerfRow[]> {
      const data = await request("GetPageStats", { siteUrl });
      const rows = Array.isArray(data) ? data : [];
      return rows
        .map(parsePerfRow)
        .filter((row): row is BingPerfRow => row !== null);
    },

    /** `GetRankAndTrafficStats` — per-day whole-site clicks and impressions.
     *  The only endpoint that reports the site's real total: the query and page
     *  reports each return just their own top-N subset. */
    async rankAndTrafficStats(siteUrl: string): Promise<BingTrafficRow[]> {
      const data = await request("GetRankAndTrafficStats", { siteUrl });
      const rows = Array.isArray(data) ? data : [];
      return rows
        .map(parseTrafficRow)
        .filter((row): row is BingTrafficRow => row !== null);
    },

    /** `GetCrawlStats` — per-day crawl and index counts for a site. */
    async crawlStats(siteUrl: string): Promise<BingCrawlStat[]> {
      const data = await request("GetCrawlStats", { siteUrl });
      const rows = Array.isArray(data) ? data : [];
      return rows
        .map(parseCrawlStat)
        .filter((row): row is BingCrawlStat => row !== null);
    },

    /** `GetCrawlIssues` — the URLs Bing reports crawl issues for. Empty when
     *  Bing found none. */
    async crawlIssues(siteUrl: string): Promise<BingCrawlIssue[]> {
      const data = await request("GetCrawlIssues", { siteUrl });
      const rows = Array.isArray(data) ? data : [];
      return rows
        .map(parseCrawlIssue)
        .filter((row): row is BingCrawlIssue => row !== null);
    },

    /** `GetUrlInfo` — crawl details for one URL. Bing returns a single object
     *  (or a one-element array); null when the response has no usable fields. */
    async urlInfo(siteUrl: string, url: string): Promise<BingUrlInfo | null> {
      const data = await request("GetUrlInfo", { siteUrl, url });
      const parsed = z
        .union([urlInfoSchema, z.array(urlInfoSchema)])
        .safeParse(data);
      if (!parsed.success) return null;
      const row = Array.isArray(parsed.data) ? parsed.data[0] : parsed.data;
      return parseUrlInfo(row, url);
    },
  };
}
