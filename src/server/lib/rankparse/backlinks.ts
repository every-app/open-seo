import {
  backlinksSummaryItemSchema,
  backlinksItemSchema,
  referringDomainItemSchema,
  domainPageSummaryItemSchema,
  type backlinksHistoryItemSchema,
} from "@/server/lib/dataforseo/backlinksSchemas";
import type { DataforseoApiResponse } from "@/server/lib/dataforseo/envelope";
import {
  rankparseGet,
  RANKPARSE_COST_PER_CREDIT_USD,
} from "@/server/lib/rankparse/client";

type BacklinksRequest = { target: string };
type BacklinksListRequest = BacklinksRequest & {
  limit?: number;
  offset?: number;
  orderBy?: string[];
  filters?: unknown[];
};
type BacklinksTimeseriesRequest = {
  target: string;
  dateFrom: string;
  dateTo: string;
};

type RankparseBacklinkItem = {
  from_domain?: string | null;
  from_url?: string | null;
  to_url?: string | null;
  anchor_text?: string | null;
  rel?: string | null;
  link_type?: string | null;
  // Documented but absent from the live API response as of this writing —
  // kept optional so the `?? null` mapping below degrades gracefully either
  // way rather than assuming its presence.
  domain_host_count?: number | null;
  crawled_at?: string | null;
};

type RankparseReferringDomainItem = {
  from_domain?: string | null;
  // Verified against the live API (docs say `from_host_count`; the actual
  // response field is `total_links`). dofollow_links/nofollow_links are real
  // fields but always 0 in practice — that column isn't populated in the
  // referring_domains table, so they're intentionally unused below rather
  // than summed into a false-confident 0.
  total_links?: number | null;
  dofollow_links?: number | null;
  nofollow_links?: number | null;
};

type RankparseTopPageItem = {
  url?: string | null;
  inbound_links?: number | null;
  referring_domains?: number | null;
  status_code?: number | null;
  mime?: string | null;
};

type RankparseDomainAuthority = {
  score?: number | null;
  referring_domains?: number | null;
  total_host_count?: number | null;
};

type RankparseDomainRank = {
  inbound_edges?: number | null;
  unique_domains?: number | null;
  avg_linking_host_count?: number | null;
};

/**
 * RankParse's link-graph endpoints (backlinks, referring-domains, top-pages,
 * site-explorer) are domain-only in v1 — there is no page-level equivalent to
 * DataForSEO's `scope: "page"` target. Rather than issuing a domain-shaped
 * call with a full URL (which would silently return wrong data), every
 * fetcher below short-circuits to an explicit empty/null result for page
 * targets. Nulls (not 0s) so the UI's "?" placeholder renders instead of a
 * false-confident zero.
 */
function isPageScopeTarget(target: string): boolean {
  return target.includes("://");
}

function billingFor(endpoint: string, creditsUsed: number) {
  return {
    path: ["v3", "backlinks", "rankparse", endpoint],
    costUsd: creditsUsed * RANKPARSE_COST_PER_CREDIT_USD,
  };
}

/** Walks a (possibly nested, and/or-joined) DataForSEO filter-expression tree
 * for a `["domain_from", "=", value]` leaf — the one filter the Backlinks tab
 * round-trips server-side today (the "expand this domain's links" action).
 * Every other filter field is a no-op under this provider. */
function findDomainFromEquals(
  filters: unknown[] | undefined,
): string | undefined {
  if (!filters) return undefined;
  for (const entry of filters) {
    if (!Array.isArray(entry)) continue;
    if (
      entry.length === 3 &&
      entry[0] === "domain_from" &&
      entry[1] === "=" &&
      typeof entry[2] === "string"
    ) {
      return entry[2];
    }
    const nested = findDomainFromEquals(entry as unknown[]);
    if (nested) return nested;
  }
  return undefined;
}

/** DataForSEO order_by entries look like "first_seen,desc"; RankParse only
 * offers a coarse importance|recent sort. */
function mapSort(orderBy: string[] | undefined): "importance" | "recent" {
  return orderBy?.[0]?.startsWith("first_seen") ? "recent" : "importance";
}

/**
 * Built from two fast, pre-aggregated lookups rather than /v1/site-explorer:
 * site-explorer bundles backlinks+top_pages+anchor_text+authority into one
 * 10-credit call and times out on high-traffic domains (verified against the
 * live API: github.com times out at 30s), and its `backlinks_total` field is
 * capped at the internal query limit (10), not a real total. domain-rank's
 * `inbound_edges` is a genuine pre-aggregated total from the domain_authority
 * table, same latency profile as domain-authority itself (sub-second even for
 * github.com).
 */
export async function fetchBacklinksSummary(
  input: BacklinksRequest,
): Promise<
  DataforseoApiResponse<ReturnType<typeof backlinksSummaryItemSchema.parse>>
> {
  if (isPageScopeTarget(input.target)) {
    return {
      data: backlinksSummaryItemSchema.parse({ target: input.target }),
      billing: billingFor("summary", 0),
    };
  }

  const [authority, rank] = await Promise.all([
    rankparseGet<RankparseDomainAuthority>("/domain-authority", {
      domain: input.target,
    }),
    rankparseGet<RankparseDomainRank>("/domain-rank", { domain: input.target }),
  ]);

  const data = backlinksSummaryItemSchema.parse({
    target: input.target,
    rank: authority.data.score ?? null,
    backlinks: rank.data.inbound_edges ?? null,
    referring_domains: authority.data.referring_domains ?? null,
  });

  return {
    data,
    billing: billingFor("summary", authority.credits_used + rank.credits_used),
  };
}

export async function fetchBacklinksRows(input: BacklinksListRequest): Promise<
  DataforseoApiResponse<{
    items: Array<ReturnType<typeof backlinksItemSchema.parse>>;
    totalCount: number | null;
  }>
> {
  if (isPageScopeTarget(input.target)) {
    return {
      data: { items: [], totalCount: 0 },
      billing: billingFor("backlinks", 0),
    };
  }

  const envelope = await rankparseGet<RankparseBacklinkItem[]>("/backlinks", {
    domain: input.target,
    limit: input.limit ?? 100,
    offset: input.offset,
    sort: mapSort(input.orderBy),
    from_domain: findDomainFromEquals(input.filters),
  });

  const items = envelope.data.map((item) =>
    backlinksItemSchema.parse({
      domain_from: item.from_domain ?? null,
      url_from: item.from_url ?? null,
      url_to: item.to_url ?? null,
      anchor: item.anchor_text ?? null,
      item_type: item.link_type ?? null,
      dofollow: item.rel ? !item.rel.toLowerCase().includes("nofollow") : true,
      domain_from_rank: item.domain_host_count ?? null,
      first_seen: item.crawled_at ?? null,
      last_visited: item.crawled_at ?? null,
      is_lost: false,
      is_broken: false,
      rel_attributes: item.rel ? [item.rel] : [],
      attributes: item.rel ? [item.rel] : [],
    }),
  );

  return {
    // RankParse's envelope `total` is the row count of THIS page (verified
    // against the API source: `total: rows.length`), not a grand total across
    // the domain — passing it through would make buildPageResult's
    // `offset + rows.length < totalCount` always false, breaking "load more"
    // pagination. `null` lets it fall back to the `rows.length === pageSize`
    // heuristic instead.
    data: { items, totalCount: null },
    billing: billingFor("backlinks", envelope.credits_used),
  };
}

export async function fetchReferringDomains(
  input: BacklinksListRequest,
): Promise<
  DataforseoApiResponse<{
    items: Array<ReturnType<typeof referringDomainItemSchema.parse>>;
    totalCount: number | null;
  }>
> {
  if (isPageScopeTarget(input.target)) {
    return {
      data: { items: [], totalCount: 0 },
      billing: billingFor("referring_domains", 0),
    };
  }

  const envelope = await rankparseGet<RankparseReferringDomainItem[]>(
    "/referring-domains",
    { domain: input.target, limit: input.limit ?? 100, offset: input.offset },
  );

  const items = envelope.data.map((item) =>
    referringDomainItemSchema.parse({
      domain: item.from_domain ?? null,
      backlinks: item.total_links ?? null,
    }),
  );

  return {
    // See the matching comment in fetchBacklinksRows — RankParse's `total` is
    // per-page, not a grand total.
    data: { items, totalCount: null },
    billing: billingFor("referring_domains", envelope.credits_used),
  };
}

export async function fetchDomainPagesSummary(
  input: BacklinksListRequest,
): Promise<
  DataforseoApiResponse<{
    items: Array<ReturnType<typeof domainPageSummaryItemSchema.parse>>;
    totalCount: number | null;
  }>
> {
  if (isPageScopeTarget(input.target)) {
    return {
      data: { items: [], totalCount: 0 },
      billing: billingFor("top_pages", 0),
    };
  }

  const envelope = await rankparseGet<RankparseTopPageItem[]>("/top-pages", {
    domain: input.target,
    limit: input.limit ?? 100,
    offset: input.offset,
  });

  const items = envelope.data.map((item) =>
    domainPageSummaryItemSchema.parse({
      page: item.url ?? null,
      url: item.url ?? null,
      backlinks: item.inbound_links ?? null,
      referring_domains: item.referring_domains ?? null,
    }),
  );

  return {
    // See the matching comment in fetchBacklinksRows — RankParse's `total` is
    // per-page, not a grand total.
    data: { items, totalCount: null },
    billing: billingFor("top_pages", envelope.credits_used),
  };
}

/**
 * RankParse has no history/timeseries data yet (its link-velocity/new-links/
 * lost-links endpoints are 0-credit v1 stubs returning `not_yet_available`).
 * Returns an empty series with no network call — the overview UI already
 * renders an empty state for domains with no trend data.
 */
export async function fetchBacklinksHistory(
  _input: BacklinksTimeseriesRequest,
): Promise<
  DataforseoApiResponse<
    Array<ReturnType<typeof backlinksHistoryItemSchema.parse>>
  >
> {
  return { data: [], billing: billingFor("history", 0) };
}
