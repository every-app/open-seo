import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { executeInBatches } from "@/db/runBatch";
import { psPlatforms, psSerpObservations } from "@/db/schema";
import type { PsAiVerdict, PsPlatformStatus } from "@/shared/platform-seo";

// D1 caps bound parameters at ~100 per statement.
const OBSERVATIONS_PER_INSERT = 7; // 14 columns
const PLATFORMS_PER_INSERT = 8; // 11 columns
const VALUES_PER_IN = 90;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

export type ObservationInput = {
  organizationId: string;
  projectId: string | null;
  runKey: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
  device: "desktop" | "mobile";
  position: number;
  domain: string;
  resultKey: string;
  url: string | null;
  title: string | null;
  observedAt: string;
};

/** Domains already recorded for this run (a replay of it adds the rest). */
async function listRunDomains(organizationId: string, runKey: string) {
  const rows = await db
    .selectDistinct({ domain: psSerpObservations.domain })
    .from(psSerpObservations)
    .where(
      and(
        eq(psSerpObservations.organizationId, organizationId),
        eq(psSerpObservations.runKey, runKey),
      ),
    );
  return rows.map((row) => row.domain);
}

async function insertObservations(rows: ObservationInput[]) {
  await executeInBatches(chunk(rows, OBSERVATIONS_PER_INSERT), (tx, part) =>
    tx
      .insert(psSerpObservations)
      .values(part.map((row) => ({ id: crypto.randomUUID(), ...row })))
      .onConflictDoNothing(),
  );
}

export type NewPlatformInput = {
  organizationId: string;
  domain: string;
  status: PsPlatformStatus;
  source: "seed" | "serp";
  exampleKeyword: string | null;
  exampleUrl: string | null;
  exampleTitle: string | null;
  bestPosition: number | null;
  seenCount: number;
  lastSeenAt: string | null;
};

/** Inserts platforms not already listed; returns the ones it added. */
async function insertPlatforms(rows: NewPlatformInput[]) {
  const added: Array<{ id: string; domain: string; status: PsPlatformStatus }> =
    [];
  for (const part of chunk(rows, PLATFORMS_PER_INSERT)) {
    added.push(
      ...(await db
        .insert(psPlatforms)
        .values(part.map((row) => ({ id: crypto.randomUUID(), ...row })))
        .onConflictDoNothing()
        .returning({
          id: psPlatforms.id,
          domain: psPlatforms.domain,
          status: psPlatforms.status,
        })),
    );
  }
  return added;
}

/**
 * Adds platforms seen on a page, or adds each row's seenCount (1, or 0 for a
 * replay) to listed ones and keeps their best position. One upsert, so recordings running at the
 * same time (one lookup's keywords) can't lose each other's sightings.
 */
async function upsertSeenPlatforms(rows: NewPlatformInput[]) {
  const seen: Array<{
    id: string;
    domain: string;
    status: PsPlatformStatus;
    seenCount: number;
    aiClassifiedAt: string | null;
  }> = [];
  for (const part of chunk(rows, PLATFORMS_PER_INSERT)) {
    seen.push(
      ...(await db
        .insert(psPlatforms)
        .values(part.map((row) => ({ id: crypto.randomUUID(), ...row })))
        .onConflictDoUpdate({
          target: [psPlatforms.organizationId, psPlatforms.domain],
          set: {
            seenCount: sql`${psPlatforms.seenCount} + excluded.seen_count`,
            lastSeenAt: sql`excluded.last_seen_at`,
            bestPosition: sql`case when ${psPlatforms.bestPosition} is null or ${psPlatforms.bestPosition} > excluded.best_position then excluded.best_position else ${psPlatforms.bestPosition} end`,
          },
        })
        .returning({
          id: psPlatforms.id,
          domain: psPlatforms.domain,
          status: psPlatforms.status,
          seenCount: psPlatforms.seenCount,
          aiClassifiedAt: psPlatforms.aiClassifiedAt,
        })),
    );
  }
  return seen;
}

async function hasSeededPlatforms(organizationId: string) {
  const rows = await db
    .select({ id: psPlatforms.id })
    .from(psPlatforms)
    .where(
      and(
        eq(psPlatforms.organizationId, organizationId),
        eq(psPlatforms.source, "seed"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function listPlatforms(organizationId: string) {
  return db
    .select()
    .from(psPlatforms)
    .where(eq(psPlatforms.organizationId, organizationId))
    .orderBy(
      asc(psPlatforms.bestPosition),
      desc(psPlatforms.seenCount),
      asc(psPlatforms.domain),
    )
    .limit(2000);
}

async function setStatus(
  organizationId: string,
  platformId: string,
  status: PsPlatformStatus,
) {
  const updated = await db
    .update(psPlatforms)
    .set({ status, classifiedAt: new Date().toISOString() })
    .where(
      and(
        eq(psPlatforms.organizationId, organizationId),
        eq(psPlatforms.id, platformId),
      ),
    )
    .returning({ id: psPlatforms.id });
  return updated.length > 0;
}

/** Pending platforms the AI hasn't looked at yet, optionally just these ids. */
async function listUnclassified(
  organizationId: string,
  options: { ids?: string[]; limit: number },
) {
  const conditions = [
    eq(psPlatforms.organizationId, organizationId),
    eq(psPlatforms.status, "pending"),
    isNull(psPlatforms.aiClassifiedAt),
  ];
  if (options.ids) {
    if (options.ids.length === 0) return [];
    conditions.push(
      inArray(psPlatforms.id, options.ids.slice(0, VALUES_PER_IN)),
    );
  }
  return db
    .select({
      id: psPlatforms.id,
      domain: psPlatforms.domain,
      exampleKeyword: psPlatforms.exampleKeyword,
      exampleUrl: psPlatforms.exampleUrl,
      exampleTitle: psPlatforms.exampleTitle,
    })
    .from(psPlatforms)
    .where(and(...conditions))
    .orderBy(asc(psPlatforms.firstSeenAt))
    .limit(options.limit);
}

async function saveClassifications(
  organizationId: string,
  rows: Array<{
    id: string;
    verdict: PsAiVerdict;
    canProfile: boolean | null;
    canPost: boolean | null;
    reason: string;
  }>,
) {
  const classifiedAt = new Date().toISOString();
  await executeInBatches(rows, (tx, row) =>
    tx
      .update(psPlatforms)
      .set({
        aiVerdict: row.verdict,
        aiCanProfile: row.canProfile,
        aiCanPost: row.canPost,
        aiReason: row.reason,
        aiClassifiedAt: classifiedAt,
      })
      .where(
        and(
          eq(psPlatforms.organizationId, organizationId),
          eq(psPlatforms.id, row.id),
        ),
      ),
  );
}

/**
 * Page 1-2 results for these keywords in one market, each with the platform's
 * status. Every run is returned; the caller keeps each keyword's latest.
 */
async function listObservationsWithPlatforms(params: {
  organizationId: string;
  keywords: string[];
  locationCode: number;
  languageCode: string;
  maxPosition: number;
}) {
  const rows: Array<{
    keyword: string;
    runKey: string;
    observedAt: string;
    position: number;
    status: PsPlatformStatus | null;
    aiVerdict: PsAiVerdict | null;
  }> = [];
  for (const part of chunk(params.keywords, VALUES_PER_IN - 5)) {
    rows.push(
      ...(await db
        .select({
          keyword: psSerpObservations.keyword,
          runKey: psSerpObservations.runKey,
          observedAt: psSerpObservations.observedAt,
          position: psSerpObservations.position,
          status: psPlatforms.status,
          aiVerdict: psPlatforms.aiVerdict,
        })
        .from(psSerpObservations)
        .leftJoin(
          psPlatforms,
          and(
            eq(psPlatforms.organizationId, psSerpObservations.organizationId),
            eq(psPlatforms.domain, psSerpObservations.domain),
          ),
        )
        .where(
          and(
            eq(psSerpObservations.organizationId, params.organizationId),
            eq(psSerpObservations.locationCode, params.locationCode),
            eq(psSerpObservations.languageCode, params.languageCode),
            inArray(psSerpObservations.keyword, part),
            lte(psSerpObservations.position, params.maxPosition),
          ),
        )),
    );
  }
  return rows;
}

export const PlatformDiscoveryRepository = {
  listRunDomains,
  insertObservations,
  insertPlatforms,
  upsertSeenPlatforms,
  hasSeededPlatforms,
  listPlatforms,
  setStatus,
  listUnclassified,
  saveClassifications,
  listObservationsWithPlatforms,
};
