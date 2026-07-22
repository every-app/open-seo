import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { contentScans } from "@/db/schema";

type ContentScanRecord = typeof contentScans.$inferSelect;

const HISTORY_LIMIT = 20;

export const ContentScanRepository = {
  async insertPending(args: {
    projectId: string;
    jobId: string;
    url: string;
    keyword: string;
    region: string;
  }): Promise<void> {
    await db
      .insert(contentScans)
      .values({
        id: crypto.randomUUID(),
        projectId: args.projectId,
        jobId: args.jobId,
        url: args.url,
        keyword: args.keyword,
        region: args.region,
      })
      .onConflictDoNothing();
  },

  async saveReport(args: {
    jobId: string;
    score: number | null;
    grade: string | null;
    report: string;
  }): Promise<void> {
    await db
      .update(contentScans)
      .set({ score: args.score, grade: args.grade, report: args.report })
      .where(eq(contentScans.jobId, args.jobId));
  },

  async listForProject(
    projectId: string,
  ): Promise<
    Omit<ContentScanRecord, "report" | "classifyJobId" | "pageCategory">[]
  > {
    const rows = await db
      .select({
        id: contentScans.id,
        projectId: contentScans.projectId,
        jobId: contentScans.jobId,
        url: contentScans.url,
        keyword: contentScans.keyword,
        region: contentScans.region,
        score: contentScans.score,
        grade: contentScans.grade,
        createdAt: contentScans.createdAt,
      })
      .from(contentScans)
      .where(eq(contentScans.projectId, projectId))
      .orderBy(desc(contentScans.createdAt))
      .limit(HISTORY_LIMIT);
    return rows;
  },

  async deleteForProject(projectId: string, jobId: string): Promise<void> {
    await db
      .delete(contentScans)
      .where(
        and(
          eq(contentScans.projectId, projectId),
          eq(contentScans.jobId, jobId),
        ),
      );
  },

  async getForProjectByJobId(
    projectId: string,
    jobId: string,
  ): Promise<ContentScanRecord | null> {
    const rows = await db
      .select()
      .from(contentScans)
      .where(eq(contentScans.jobId, jobId))
      .limit(1);
    const row = rows[0];
    if (!row || row.projectId !== projectId) return null;
    return row;
  },
};
