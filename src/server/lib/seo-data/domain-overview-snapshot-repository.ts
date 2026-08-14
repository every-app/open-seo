import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { domainOverviewSnapshots } from "@/db/schema";
import { getDefaultCacheTtl } from "./config";

export type DomainOverviewSnapshot = {
  organicTraffic: number | null;
  organicKeywords: number | null;
  fetchedAt: string;
};

const SNAPSHOT_MAX_AGE_MS = getDefaultCacheTtl("domain_overview") * 1_000;

async function getFresh(params: {
  organizationId: string;
  domain: string;
  locationCode: number;
  languageCode: string;
  now?: number;
}): Promise<DomainOverviewSnapshot | null> {
  const rows = await db
    .select()
    .from(domainOverviewSnapshots)
    .where(
      and(
        eq(domainOverviewSnapshots.organizationId, params.organizationId),
        eq(domainOverviewSnapshots.domain, params.domain),
        eq(domainOverviewSnapshots.locationCode, params.locationCode),
        eq(domainOverviewSnapshots.languageCode, params.languageCode),
      ),
    )
    .orderBy(desc(domainOverviewSnapshots.id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  const fetchedMs = Date.parse(row.fetchedAt);
  if (
    !Number.isFinite(fetchedMs) ||
    (params.now ?? Date.now()) - fetchedMs >= SNAPSHOT_MAX_AGE_MS
  ) {
    return null;
  }

  return {
    organicTraffic: row.organicTraffic,
    organicKeywords: row.organicKeywords,
    fetchedAt: row.fetchedAt,
  };
}

async function insert(params: {
  organizationId: string;
  domain: string;
  locationCode: number;
  languageCode: string;
  organicTraffic: number | null;
  organicKeywords: number | null;
}): Promise<void> {
  await db.insert(domainOverviewSnapshots).values({
    ...params,
    fetchedAt: new Date().toISOString(),
  });
}

export const DomainOverviewSnapshotRepository = { getFresh, insert };
