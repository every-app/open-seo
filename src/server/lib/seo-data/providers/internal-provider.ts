import { db } from "@/db";
import {
  keywordMetrics,
  backlinkSnapshots,
  rankSnapshots,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import type { SEODataProvider, SEODataRequest } from "../types";
import { ProviderUnsupportedError } from "../errors";

/**
 * Internal data provider — reads from OpenSEO's own database (keyword_metrics
 * table, backlink_snapshots, rank_snapshots). This data was previously fetched
 * from DataForSEO and persisted, so it serves as a free source that avoids
 * re-fetching the same data.
 *
 * Serves:
 *   - keyword_metrics: from the keyword_metrics table (latest per keyword)
 *   - backlinks: from backlink_snapshots (latest summary per project)
 *   - domain_keywords: from rank_snapshots (latest tracked keyword positions)
 *   - competitors: not yet (would require persisting competitor analysis)
 */
export function createInternalProvider(): SEODataProvider {
  return {
    name: "internal",

    supports(request: SEODataRequest): boolean {
      return (
        request.dataType === "keyword_metrics" ||
        request.dataType === "backlinks" ||
        request.dataType === "domain_keywords" ||
        request.dataType === "competitors"
      );
    },

    async get(request: SEODataRequest): Promise<unknown> {
      switch (request.dataType) {
        case "keyword_metrics":
          return getInternalKeywordMetrics(request);
        case "backlinks":
          return getInternalBacklinks(request);
        case "domain_keywords":
          return getInternalDomainKeywords(request);
        case "competitors":
          return getInternalCompetitors(request);
        default:
          throw new ProviderUnsupportedError(
            "internal",
            request.dataType,
            `Internal provider does not serve ${request.dataType}`,
          );
      }
    },
  };
}

/**
 * Read keyword metrics from the D1 keyword_metrics table.
 */
async function getInternalKeywordMetrics(
  request: SEODataRequest,
): Promise<unknown> {
  const keywords =
    request.keywords ?? (request.keyword ? [request.keyword] : []);
  if (keywords.length === 0) {
    throw new ProviderUnsupportedError(
      "internal",
      "keyword_metrics",
      "No keywords provided",
    );
  }

  const projectId =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    request.constraints?.projectId as string | undefined;
  const locationCode = request.locationCode ?? 2840;
  const languageCode = request.languageCode ?? "en";

  const conditions = [
    eq(keywordMetrics.locationCode, locationCode),
    eq(keywordMetrics.languageCode, languageCode),
  ];

  if (projectId) {
    conditions.push(eq(keywordMetrics.projectId, projectId));
  }

  const rows = await db
    .select()
    .from(keywordMetrics)
    .where(and(...conditions))
    .limit(keywords.length * 2);

  const keywordSet = new Set(keywords.map((k) => k.toLowerCase()));
  const filtered = rows.filter((r) =>
    keywordSet.has(r.keyword.toLowerCase()),
  );

  if (filtered.length === 0) {
    throw new ProviderUnsupportedError(
      "internal",
      "keyword_metrics",
      "No cached keyword metrics found",
    );
  }

  return filtered.map((row) => ({
    keyword: row.keyword,
    searchVolume: row.searchVolume,
    cpc: row.cpc,
    competition: row.competition,
    keywordDifficulty: row.keywordDifficulty,
    intent: row.intent,
    monthlySearches: row.monthlySearches,
    fetchedAt: row.fetchedAt,
  }));
}

/**
 * Read the latest backlink snapshot for a project from backlink_snapshots.
 * This is summary data (not full backlink rows), so it serves as a quick
 * overview without calling DataForSEO.
 */
async function getInternalBacklinks(
  request: SEODataRequest,
): Promise<unknown> {
  const projectId =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    request.constraints?.projectId as string | undefined;
  const domain = request.domain;

  if (!projectId && !domain) {
    throw new ProviderUnsupportedError(
      "internal",
      "backlinks",
      "projectId or domain is required",
    );
  }

  const conditions = [];
  if (projectId) {
    conditions.push(eq(backlinkSnapshots.projectId, projectId));
  }
  if (domain) {
    conditions.push(eq(backlinkSnapshots.domain, domain));
  }

  const rows = await db
    .select()
    .from(backlinkSnapshots)
    .where(and(...conditions))
    .orderBy(desc(backlinkSnapshots.capturedAt))
    .limit(1);

  if (rows.length === 0) {
    throw new ProviderUnsupportedError(
      "internal",
      "backlinks",
      "No cached backlink snapshot found",
    );
  }

  const row = rows[0];
  return {
    domain: row.domain,
    rank: row.rank,
    backlinks: row.backlinks,
    referringDomains: row.referringDomains,
    brokenBacklinks: row.brokenBacklinks,
    newBacklinks: row.newBacklinks,
    lostBacklinks: row.lostBacklinks,
    newReferringDomains: row.newReferringDomains,
    lostReferringDomains: row.lostReferringDomains,
    capturedAt: row.capturedAt,
  };
}

/**
 * Read the latest tracked keyword positions from rank_snapshots. This serves
 * domain_keywords for keywords the user is already tracking — not the full
 * DataForSEO domain keyword universe, but the tracked subset is free.
 */
async function getInternalDomainKeywords(
  request: SEODataRequest,
): Promise<unknown> {
  const projectId =
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- constraints is Record<string, unknown>
    request.constraints?.projectId as string | undefined;

  if (!projectId) {
    throw new ProviderUnsupportedError(
      "internal",
      "domain_keywords",
      "projectId is required",
    );
  }

  const rows = await db
    .select({
      keyword: rankSnapshots.keyword,
      device: rankSnapshots.device,
      position: rankSnapshots.position,
      url: rankSnapshots.url,
      checkedAt: rankSnapshots.checkedAt,
    })
    .from(rankSnapshots)
    .orderBy(desc(rankSnapshots.checkedAt))
    .limit(100);

  if (rows.length === 0) {
    throw new ProviderUnsupportedError(
      "internal",
      "domain_keywords",
      "No tracked keyword snapshots found",
    );
  }

  // Deduplicate: keep only the latest snapshot per (keyword, device)
  const seen = new Set<string>();
  const result: Array<{
    keyword: string;
    device: string;
    position: number | null;
    url: string | null;
    checkedAt: string;
  }> = [];
  for (const row of rows) {
    const key = `${row.keyword}|${row.device}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      keyword: row.keyword,
      device: row.device,
      position: row.position,
      url: row.url,
      checkedAt: row.checkedAt,
    });
  }

  return {
    items: result,
    totalCount: result.length,
  };
}

/**
 * Competitors are not yet persisted in D1. This always returns unsupported so
 * the router falls back to DataForSEO.
 */
async function getInternalCompetitors(
  _request: SEODataRequest,
): Promise<unknown> {
  throw new ProviderUnsupportedError(
    "internal",
    "competitors",
    "Competitor data is not persisted in D1",
  );
}