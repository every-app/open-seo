import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { paaScans } from "@/db/schema";

type PaaScanRecord = typeof paaScans.$inferSelect;

const HISTORY_LIMIT = 20;

export const PaaScanRepository = {
  async insertPending(args: {
    projectId: string;
    scanId: string;
    seed: string;
    region: string;
  }): Promise<void> {
    await db
      .insert(paaScans)
      .values({
        id: crypto.randomUUID(),
        projectId: args.projectId,
        scanId: args.scanId,
        seed: args.seed,
        region: args.region,
      })
      .onConflictDoNothing();
  },

  async saveReport(args: {
    scanId: string;
    questionCount: number;
    report: string;
  }): Promise<void> {
    await db
      .update(paaScans)
      .set({ questionCount: args.questionCount, report: args.report })
      .where(eq(paaScans.scanId, args.scanId));
  },

  async listForProject(
    projectId: string,
  ): Promise<Omit<PaaScanRecord, "report">[]> {
    const rows = await db
      .select({
        id: paaScans.id,
        projectId: paaScans.projectId,
        scanId: paaScans.scanId,
        seed: paaScans.seed,
        region: paaScans.region,
        questionCount: paaScans.questionCount,
        createdAt: paaScans.createdAt,
      })
      .from(paaScans)
      .where(eq(paaScans.projectId, projectId))
      .orderBy(desc(paaScans.createdAt))
      .limit(HISTORY_LIMIT);
    return rows;
  },

  async deleteForProject(projectId: string, scanId: string): Promise<void> {
    await db
      .delete(paaScans)
      .where(
        and(eq(paaScans.projectId, projectId), eq(paaScans.scanId, scanId)),
      );
  },

  async getForProjectByScanId(
    projectId: string,
    scanId: string,
  ): Promise<PaaScanRecord | null> {
    const rows = await db
      .select()
      .from(paaScans)
      .where(eq(paaScans.scanId, scanId))
      .limit(1);
    const row = rows[0];
    if (!row || row.projectId !== projectId) return null;
    return row;
  },
};
