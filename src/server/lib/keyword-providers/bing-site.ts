import { AppError } from "@/server/lib/errors";
import { bingFetch, BING_ENV, hasBingCredentials } from "./bing";

export type BingInboundLinkCounts = {
  sourcedDomains: number;
  backlinks: number;
  topSources: Array<{ source: string; backlinks: number }>;
};

export type BingQueryStats = {
  query: string;
  impressions: number;
  clicks: number;
  ctr: number | null;
};

type BingSitesResponse = {
  d?: Array<{ Url?: string | null }>;
};

type BingLinkCountsResponse = {
  d?: Array<{
    Source?: string | null;
    LinkCount?: { SourcedDomains?: number | null; Backlinks?: number | null };
  }>;
};

type BingQueryStatsResponse = {
  d?: Array<{
    Query?: string | null;
    Impressions?: number | null;
    Clicks?: number | null;
  }>;
};

export async function fetchBingUserSites(): Promise<string[]> {
  const payload = await bingFetch<BingSitesResponse>("/GetUserSites", {});
  return (payload.d ?? [])
    .map((site) => site.Url ?? "")
    .filter((url) => url.length > 0);
}

/**
 * Inbound link totals for a site registered in Bing Webmaster. Bing only
 * serves link data for registered sites, so unregistered domains return 0s.
 */
export async function fetchBingInboundLinkCounts(
  siteUrl: string,
): Promise<BingInboundLinkCounts> {
  const payload = await bingFetch<BingLinkCountsResponse>("/GetLinkCounts", {
    siteUrl,
  });

  const rows = payload.d ?? [];
  const topSources = rows
    .map((row) => ({
      source: row.Source ?? "",
      backlinks: row.LinkCount?.Backlinks ?? 0,
    }))
    .filter((row) => row.source.length > 0);

  const sourcedDomains = rows.reduce(
    (sum, row) => sum + (row.LinkCount?.SourcedDomains ?? 0),
    0,
  );
  const backlinks = topSources.reduce((sum, row) => sum + row.backlinks, 0);

  return {
    sourcedDomains,
    backlinks,
    topSources: topSources.slice(0, 10),
  };
}

/** Aggregated search-traffic queries for a registered site (last ~30 days). */
export async function fetchBingQueryStats(
  siteUrl: string,
): Promise<BingQueryStats[]> {
  const payload = await bingFetch<BingQueryStatsResponse>("/GetQueryStats", {
    siteUrl,
  });

  const byQuery = new Map<string, BingQueryStats>();
  for (const row of payload.d ?? []) {
    const query = row.Query ?? "";
    if (!query) continue;
    const existing = byQuery.get(query) ?? {
      query,
      impressions: 0,
      clicks: 0,
      ctr: null,
    };
    existing.impressions += row.Impressions ?? 0;
    existing.clicks += row.Clicks ?? 0;
    byQuery.set(query, existing);
  }

  return [...byQuery.values()]
    .map((row) => ({
      ...row,
      ctr:
        row.impressions > 0
          ? Math.round((row.clicks / row.impressions) * 10000) / 10000
          : null,
    }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 25);
}

/**
 * Bing-backed partial overview used when DataForSEO is unconfigured. Returns
 * null when Bing credentials are missing so callers keep the provider error.
 */
export async function getBingPartialOverview(domain: string): Promise<{
  provider: "bing_webmaster";
  backlinks: number | null;
  referringDomains: number | null;
  topQueries: BingQueryStats[];
  notes: string[];
} | null> {
  if (!(await hasBingCredentials())) return null;

  const siteUrl = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const notes = [
    "Data source: Bing Webmaster (free). Requires the site to be registered in Bing Webmaster Tools.",
  ];

  try {
    const registered = await fetchBingUserSites();
    const isRegistered = registered.some(
      (url) => url.replace(/\/$/, "").toLowerCase() === siteUrl.toLowerCase(),
    );
    if (!isRegistered) {
      notes.push(
        `${siteUrl} is not registered in Bing Webmaster Tools; link and query data are unavailable for it.`,
      );
      return {
        provider: "bing_webmaster",
        backlinks: null,
        referringDomains: null,
        topQueries: [],
        notes,
      };
    }

    const [links, queries] = await Promise.all([
      fetchBingInboundLinkCounts(siteUrl),
      fetchBingQueryStats(siteUrl),
    ]);
    return {
      provider: "bing_webmaster",
      backlinks: links.backlinks,
      referringDomains: links.sourcedDomains,
      topQueries: queries,
      notes,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AppError("UPSTREAM_UNAVAILABLE", `Bing Webmaster: ${message}`);
  }
}

export { BING_ENV };
