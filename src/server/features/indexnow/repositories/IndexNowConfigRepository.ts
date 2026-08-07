import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { indexnowConfigs, projects } from "@/db/schema";

export type IndexNowConfig = typeof indexnowConfigs.$inferSelect;

async function getByProjectId(
  projectId: string,
): Promise<IndexNowConfig | null> {
  const rows = await db
    .select()
    .from(indexnowConfigs)
    .where(eq(indexnowConfigs.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

async function listEnabled(): Promise<IndexNowConfig[]> {
  return db
    .select({
      id: indexnowConfigs.id,
      projectId: indexnowConfigs.projectId,
      organizationId: indexnowConfigs.organizationId,
      host: indexnowConfigs.host,
      key: indexnowConfigs.key,
      keyLocation: indexnowConfigs.keyLocation,
      enabled: indexnowConfigs.enabled,
      createdAt: indexnowConfigs.createdAt,
      updatedAt: indexnowConfigs.updatedAt,
    })
    .from(indexnowConfigs)
    .innerJoin(projects, eq(indexnowConfigs.projectId, projects.id))
    .where(and(eq(indexnowConfigs.enabled, true), isNull(projects.archivedAt)));
}

async function upsert(input: {
  projectId: string;
  organizationId: string;
  host: string;
  key: string;
  keyLocation: string;
  enabled: boolean;
}): Promise<IndexNowConfig> {
  const [row] = await db
    .insert(indexnowConfigs)
    .values({ id: crypto.randomUUID(), ...input })
    .onConflictDoUpdate({
      target: indexnowConfigs.projectId,
      set: {
        organizationId: input.organizationId,
        host: input.host,
        key: input.key,
        keyLocation: input.keyLocation,
        enabled: input.enabled,
        updatedAt: sql`(current_timestamp)`,
      },
    })
    .returning();
  if (!row) throw new Error("Failed to upsert indexnow_config");
  return row;
}

async function deleteByProjectId(projectId: string): Promise<void> {
  await db
    .delete(indexnowConfigs)
    .where(eq(indexnowConfigs.projectId, projectId));
}

export const IndexNowConfigRepository = {
  getByProjectId,
  listEnabled,
  upsert,
  deleteByProjectId,
};
