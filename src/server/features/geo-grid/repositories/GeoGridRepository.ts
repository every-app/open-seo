import { and, eq, inArray, desc } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { db } from "@/db";
import {
  geoGridConfigs,
  geoGridKeywords,
  geoGridRuns,
  geoGridSnapshots,
} from "@/db/schema";

export class GeoGridRepository {
  static async getConfigsForProject(projectId: string) {
    return db
      .select()
      .from(geoGridConfigs)
      .where(
        and(
          eq(geoGridConfigs.projectId, projectId),
          eq(geoGridConfigs.isActive, true),
        ),
      )
      .orderBy(geoGridConfigs.createdAt);
  }

  static async getConfigById(configId: string, projectId: string) {
    const rows = await db
      .select()
      .from(geoGridConfigs)
      .where(
        and(
          eq(geoGridConfigs.id, configId),
          eq(geoGridConfigs.projectId, projectId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  static async createConfig(data: InferInsertModel<typeof geoGridConfigs>) {
    await db.insert(geoGridConfigs).values(data);
  }

  static async updateConfig(
    configId: string,
    projectId: string,
    data: Partial<InferInsertModel<typeof geoGridConfigs>>,
  ) {
    await db
      .update(geoGridConfigs)
      .set(data)
      .where(
        and(
          eq(geoGridConfigs.id, configId),
          eq(geoGridConfigs.projectId, projectId),
        ),
      );
  }

  static async getKeywordsForConfig(configId: string) {
    return db
      .select()
      .from(geoGridKeywords)
      .where(eq(geoGridKeywords.configId, configId))
      .orderBy(geoGridKeywords.createdAt);
  }

  static async addKeywordsToConfig(
    rows: InferInsertModel<typeof geoGridKeywords>[],
  ) {
    await db.insert(geoGridKeywords).values(rows);
  }

  static async removeKeywordsFromConfig(
    keywordIds: string[],
    configId: string,
  ) {
    if (keywordIds.length === 0) return;
    await db
      .delete(geoGridKeywords)
      .where(
        and(
          eq(geoGridKeywords.configId, configId),
          inArray(geoGridKeywords.id, keywordIds),
        ),
      );
  }

  static async tryCreateRun(data: InferInsertModel<typeof geoGridRuns>) {
    try {
      await db.insert(geoGridRuns).values(data);
      return true;
    } catch (err) {
      console.error("[geo-grid] tryCreateRun failed:", err);
      return false;
    }
  }

  static async getActiveRunForConfig(configId: string) {
    const rows = await db
      .select()
      .from(geoGridRuns)
      .where(
        and(
          eq(geoGridRuns.configId, configId),
          inArray(geoGridRuns.status, ["pending", "running"]),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  static async getLatestRunForConfig(configId: string) {
    const rows = await db
      .select()
      .from(geoGridRuns)
      .where(eq(geoGridRuns.configId, configId))
      .orderBy(desc(geoGridRuns.startedAt))
      .limit(1);
    return rows[0] ?? null;
  }

  static async updateRun(
    runId: string,
    data: Partial<InferInsertModel<typeof geoGridRuns>>,
  ) {
    await db.update(geoGridRuns).set(data).where(eq(geoGridRuns.id, runId));
  }

  static async insertSnapshots(
    rows: InferInsertModel<typeof geoGridSnapshots>[],
  ) {
    if (rows.length === 0) return;
    await db.insert(geoGridSnapshots).values(rows);
  }

  static async getSnapshotsForRun(runId: string) {
    return db
      .select()
      .from(geoGridSnapshots)
      .where(eq(geoGridSnapshots.runId, runId));
  }

  static async getLatestSnapshotsForConfig(configId: string) {
    const latestRun = await this.getLatestRunForConfig(configId);
    if (!latestRun) return [];
    return this.getSnapshotsForRun(latestRun.id);
  }

  static async getRunsForConfig(configId: string) {
    return db
      .select()
      .from(geoGridRuns)
      .where(eq(geoGridRuns.configId, configId))
      .orderBy(desc(geoGridRuns.startedAt));
  }
}
