import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { indexnowConfigs } from "@/db/schema";

export type IndexNowConfig = typeof indexnowConfigs.$inferSelect;

async function getByProjectId(projectId: string): Promise<IndexNowConfig | null> {
  const rows = await db
    .select()
    .from(indexnowConfigs)
    .where(eq(indexnowConfigs.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
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
  upsert,
  deleteByProjectId,
};
