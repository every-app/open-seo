import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { brandLookupRuns } from "@/db/schema";
import type { BrandLookupResult } from "@/types/schemas/ai-search";

// Persistence for Brand Lookup runs. Every successful lookup is saved here so
// the history survives the 24h result cache, follows the project instead of one
// browser's localStorage, and can be re-opened without paying DataForSEO again.

/** How many runs a project keeps. Old runs are pruned on write. */
export const BRAND_LOOKUP_RUN_LIMIT = 100;

export type BrandLookupRunSummary = {
  id: string;
  query: string;
  resolvedTarget: string;
  scope: string | null;
  competitors: string[];
  totalMentions: number | null;
  totalAiSearchVolume: number | null;
  shareOfVoicePercent: number | null;
  fetchedAt: string;
  createdAt: string;
};

/**
 * Our own Share of Voice as a whole percent, or null when no competitors were
 * supplied. Stored as a column so a trend reads without parsing every payload.
 */
function ownSharePercent(result: BrandLookupResult): number | null {
  const entries = result.shareOfVoice?.entries;
  if (!entries?.length) return null;
  const own = entries.find((entry) => entry.isTarget);
  if (!own || typeof own.sharePct !== "number") return null;
  return Math.round(own.sharePct);
}

export async function saveBrandLookupRun(args: {
  projectId: string;
  query: string;
  competitors: string[];
  result: BrandLookupResult;
}): Promise<string> {
  const id = crypto.randomUUID();

  await db.insert(brandLookupRuns).values({
    id,
    projectId: args.projectId,
    query: args.query,
    resolvedTarget: args.result.resolvedTarget,
    scope: args.result.scope,
    competitors: JSON.stringify(args.competitors),
    totalMentions: args.result.totalMentions,
    totalAiSearchVolume: args.result.totalAiSearchVolume,
    shareOfVoicePercent: ownSharePercent(args.result),
    payload: JSON.stringify(args.result),
    fetchedAt: args.result.fetchedAt,
  });

  await pruneBrandLookupRuns(args.projectId);
  return id;
}

/**
 * Keep the newest BRAND_LOOKUP_RUN_LIMIT runs per project. Payloads are large,
 * so an unbounded table would grow without anyone noticing.
 */
async function pruneBrandLookupRuns(projectId: string): Promise<void> {
  const keep = await db
    .select({ id: brandLookupRuns.id })
    .from(brandLookupRuns)
    .where(eq(brandLookupRuns.projectId, projectId))
    .orderBy(desc(brandLookupRuns.createdAt))
    .limit(BRAND_LOOKUP_RUN_LIMIT);

  if (keep.length < BRAND_LOOKUP_RUN_LIMIT) return;

  const stale = await db
    .select({ id: brandLookupRuns.id })
    .from(brandLookupRuns)
    .where(eq(brandLookupRuns.projectId, projectId))
    .orderBy(desc(brandLookupRuns.createdAt))
    .limit(BRAND_LOOKUP_RUN_LIMIT * 2)
    .offset(BRAND_LOOKUP_RUN_LIMIT);

  for (const row of stale) {
    await db.delete(brandLookupRuns).where(eq(brandLookupRuns.id, row.id));
  }
}

function parseCompetitors(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

export async function listBrandLookupRuns(
  projectId: string,
  limit = 25,
): Promise<BrandLookupRunSummary[]> {
  const rows = await db
    .select({
      id: brandLookupRuns.id,
      query: brandLookupRuns.query,
      resolvedTarget: brandLookupRuns.resolvedTarget,
      scope: brandLookupRuns.scope,
      competitors: brandLookupRuns.competitors,
      totalMentions: brandLookupRuns.totalMentions,
      totalAiSearchVolume: brandLookupRuns.totalAiSearchVolume,
      shareOfVoicePercent: brandLookupRuns.shareOfVoicePercent,
      fetchedAt: brandLookupRuns.fetchedAt,
      createdAt: brandLookupRuns.createdAt,
    })
    .from(brandLookupRuns)
    .where(eq(brandLookupRuns.projectId, projectId))
    .orderBy(desc(brandLookupRuns.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    competitors: parseCompetitors(row.competitors),
  }));
}

/**
 * The stored result for one run, or null when there is no such run for this
 * project. Returns the raw parsed payload typed as `unknown`: the caller
 * validates it with brandLookupResultSchema, since a payload written by an
 * older result shape must not be trusted blindly.
 */
export async function getBrandLookupRunPayload(args: {
  projectId: string;
  runId: string;
}): Promise<unknown> {
  const [row] = await db
    .select({ payload: brandLookupRuns.payload })
    .from(brandLookupRuns)
    .where(
      and(
        eq(brandLookupRuns.id, args.runId),
        eq(brandLookupRuns.projectId, args.projectId),
      ),
    )
    .limit(1);

  if (!row) return null;
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

export async function deleteBrandLookupRun(args: {
  projectId: string;
  runId: string;
}): Promise<void> {
  await db
    .delete(brandLookupRuns)
    .where(
      and(
        eq(brandLookupRuns.id, args.runId),
        eq(brandLookupRuns.projectId, args.projectId),
      ),
    );
}
