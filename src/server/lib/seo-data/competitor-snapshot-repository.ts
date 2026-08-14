import { db } from "@/db";
import { competitorSnapshots } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";

/**
 * D1 persistence for SERP competitor analyses (DataForSEO labs
 * serp_competitors). The DataForSEO provider write-throughs every paid fetch
 * here; the internal provider serves the latest snapshot back for free, so a
 * repeat analysis of the same keyword set + market never re-bills.
 *
 * Snapshots are scoped by (projectId, keywordKey, locationCode, languageCode).
 * keywordKey is the canonical form of the requested keyword set — lowercased,
 * deduped, sorted — so "CRM", ["crm"] and ["crm", "sales"] + ["sales", "crm"]
 * all resolve to the same key. Rows accumulate; reads take the latest.
 */

export function canonicalKeywordKey(keywords: string[]): string {
  const canonical = [
    ...new Set(keywords.map((keyword) => keyword.toLowerCase())),
  ].toSorted();
  return JSON.stringify(canonical);
}

export async function persistCompetitorSnapshot(params: {
  projectId: string;
  keywords: string[];
  locationCode: number;
  languageCode: string;
  items: unknown[];
}): Promise<void> {
  await db.insert(competitorSnapshots).values({
    projectId: params.projectId,
    keywordKey: canonicalKeywordKey(params.keywords),
    keywordsJson: JSON.stringify(params.keywords),
    locationCode: params.locationCode,
    languageCode: params.languageCode,
    itemsJson: JSON.stringify(params.items),
  });
}

/**
 * Latest persisted snapshot for a keyword set + market, or null when none
 * exists. Corrupt JSON or a non-array payload is treated as a miss.
 */
export async function getLatestCompetitorSnapshot(params: {
  projectId: string;
  keywords: string[];
  locationCode: number;
  languageCode: string;
}): Promise<unknown[] | null> {
  const rows = await db
    .select()
    .from(competitorSnapshots)
    .where(
      and(
        eq(competitorSnapshots.projectId, params.projectId),
        eq(
          competitorSnapshots.keywordKey,
          canonicalKeywordKey(params.keywords),
        ),
        eq(competitorSnapshots.locationCode, params.locationCode),
        eq(competitorSnapshots.languageCode, params.languageCode),
      ),
    )
    .orderBy(desc(competitorSnapshots.fetchedAt))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  try {
    const parsed: unknown = JSON.parse(row.itemsJson);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
