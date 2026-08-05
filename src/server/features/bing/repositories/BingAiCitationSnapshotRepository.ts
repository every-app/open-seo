import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  bingAiCitationSnapshots,
  bingAiPageCitations,
  bingAiQueryCitations,
} from "@/db/schema";
import { executeInBatches } from "@/db/runBatch";

export type BingAiCitationSnapshot = typeof bingAiCitationSnapshots.$inferSelect;
export type BingAiPageCitation = typeof bingAiPageCitations.$inferSelect;
export type BingAiQueryCitation = typeof bingAiQueryCitations.$inferSelect;

type ReportType = "pages" | "queries";

async function listSnapshots(
  projectId: string,
  reportType: ReportType,
): Promise<BingAiCitationSnapshot[]> {
  return db
    .select()
    .from(bingAiCitationSnapshots)
    .where(
      and(
        eq(bingAiCitationSnapshots.projectId, projectId),
        eq(bingAiCitationSnapshots.reportType, reportType),
      ),
    )
    .orderBy(
      desc(bingAiCitationSnapshots.periodEnd),
      desc(bingAiCitationSnapshots.createdAt),
    );
}

async function getSnapshot(
  projectId: string,
  snapshotId: string,
): Promise<BingAiCitationSnapshot | null> {
  const rows = await db
    .select()
    .from(bingAiCitationSnapshots)
    .where(
      and(
        eq(bingAiCitationSnapshots.projectId, projectId),
        eq(bingAiCitationSnapshots.id, snapshotId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function createPagesSnapshot(input: {
  projectId: string;
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  uploadedByUserId: string;
  rows: Array<{ page: string; citations: number }>;
}): Promise<BingAiCitationSnapshot> {
  const snapshot = await insertSnapshotHeader({ ...input, reportType: "pages" });
  await executeInBatches(input.rows, (tx, row) =>
    tx.insert(bingAiPageCitations).values({
      id: crypto.randomUUID(),
      snapshotId: snapshot.id,
      projectId: input.projectId,
      page: row.page,
      citations: row.citations,
    }),
  );
  return snapshot;
}

async function createQueriesSnapshot(input: {
  projectId: string;
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  uploadedByUserId: string;
  rows: Array<{
    query: string;
    intent: string;
    topic: string;
    citations: number;
    citationSharePercent: number;
  }>;
}): Promise<BingAiCitationSnapshot> {
  const snapshot = await insertSnapshotHeader({
    ...input,
    reportType: "queries",
  });
  await executeInBatches(input.rows, (tx, row) =>
    tx.insert(bingAiQueryCitations).values({
      id: crypto.randomUUID(),
      snapshotId: snapshot.id,
      projectId: input.projectId,
      query: row.query,
      intent: row.intent,
      topic: row.topic,
      citations: row.citations,
      citationSharePercent: row.citationSharePercent,
    }),
  );
  return snapshot;
}

async function insertSnapshotHeader(input: {
  projectId: string;
  organizationId: string;
  reportType: ReportType;
  periodStart: string;
  periodEnd: string;
  uploadedByUserId: string;
  rows: { length: number };
}): Promise<BingAiCitationSnapshot> {
  const [row] = await db
    .insert(bingAiCitationSnapshots)
    .values({
      id: crypto.randomUUID(),
      projectId: input.projectId,
      organizationId: input.organizationId,
      reportType: input.reportType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      rowCount: input.rows.length,
      uploadedByUserId: input.uploadedByUserId,
    })
    .returning();
  if (!row) {
    throw new Error("Failed to create bing_ai_citation_snapshot");
  }
  return row;
}

/** Scoped by both projectId and snapshotId — the snapshot lookup already
 *  enforces project ownership, but rows carry a denormalized projectId too
 *  (see specs/0015), so this stays defense-in-depth against a stale or
 *  spoofed snapshotId ever crossing a project boundary. */
async function getPageCitations(
  projectId: string,
  snapshotId: string,
): Promise<BingAiPageCitation[]> {
  return db
    .select()
    .from(bingAiPageCitations)
    .where(
      and(
        eq(bingAiPageCitations.projectId, projectId),
        eq(bingAiPageCitations.snapshotId, snapshotId),
      ),
    )
    .orderBy(desc(bingAiPageCitations.citations));
}

async function getQueryCitations(
  projectId: string,
  snapshotId: string,
): Promise<BingAiQueryCitation[]> {
  return db
    .select()
    .from(bingAiQueryCitations)
    .where(
      and(
        eq(bingAiQueryCitations.projectId, projectId),
        eq(bingAiQueryCitations.snapshotId, snapshotId),
      ),
    )
    .orderBy(desc(bingAiQueryCitations.citations));
}

export const BingAiCitationSnapshotRepository = {
  listSnapshots,
  getSnapshot,
  createPagesSnapshot,
  createQueriesSnapshot,
  getPageCitations,
  getQueryCitations,
};
