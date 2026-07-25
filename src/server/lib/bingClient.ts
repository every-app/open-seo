import { z } from "zod";

import { getAuth } from "@/lib/auth";
import { BING_API_BASE, BING_OAUTH_PROVIDER_ID } from "@/shared/bing";

/** A Bing Webmaster REST call returned a non-2xx status, or a 2xx body that
 *  wasn't the expected WCF `d` envelope. `status` drives user-facing messaging;
 *  for a malformed-but-2xx body it carries the HTTP status we actually saw. */
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

/** No fresh access token could be minted — the user revoked the grant, or the
 *  stored Bing grant expired. Mirrors GscTokenError. */
export class BingTokenError extends Error {
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

/** GetRankAndTrafficStats returns daily site totals. Bing does not publish a
 *  stable, documented field set here and the exact PascalCase keys were not
 *  verified for this lane, so rows are surfaced as-is with any WCF `/Date(ms)/`
 *  values converted to ISO strings. See fix-summary.md (Assumptions). */
type BingRankAndTrafficStatsRow = Record<string, unknown>;

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

/** Replace any WCF `/Date(ms)/` string values in a row with ISO strings so the
 *  row is plain, serialisable JSON. Non-date values pass through untouched. */
function convertWcfDates(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const date = parseWcfDate(value);
    out[key] = date ? date.toISOString() : value;
  }
  return out;
}

function messageForStatus(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return "Bing Webmaster denied access (the connection was revoked, or this account has no verified permission). Reconnect Bing to continue.";
  }
  if (status === 429) {
    return "Bing Webmaster rate limit reached. Retry shortly.";
  }
  if (status === 404) {
    return "Bing Webmaster site not found. It may have been removed in Bing Webmaster Tools.";
  }
  return `Bing Webmaster API error (${status}): ${body.slice(0, 300)}`;
}

/** Every Bing JSON response wraps its payload under a top-level `d` key
 *  (WCF envelope). A body without `d` is an error, not an empty result — so the
 *  key must be present, though its value may legitimately be `null`/`[]`. */
const bingEnvelopeSchema = z
  .looseObject({ d: z.unknown() })
  .refine((value) => "d" in value, { message: "missing `d` envelope" });

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
    const response = await fetch(url, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      body: hasBody ? JSON.stringify(init?.body) : undefined,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new BingApiError(
        response.status,
        messageForStatus(response.status, body),
        body,
      );
    }
    const raw = await response.json().catch(() => undefined);
    const envelope = bingEnvelopeSchema.safeParse(raw);
    if (!envelope.success) {
      throw new BingApiError(
        response.status,
        "Bing Webmaster returned an unexpected response (missing the `d` envelope).",
        typeof raw === "string" ? raw : JSON.stringify(raw)?.slice(0, 300),
      );
    }
    return envelope.data.d;
  }

  return {
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
      const rows = z.array(z.looseObject({})).parse(payload);
      return rows.map((row) => convertWcfDates(row));
    },
  };
}
