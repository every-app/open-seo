import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { brandMentions, brandMonitorConfigs } from "@/db/schema";

interface UpsertableMention {
  sourceId: string;
  title: string | null;
  url: string | null;
  snippet: string | null;
  publishedAt: string | null;
  sentimentScore: number | null;
  sentimentLabel: "positive" | "neutral" | "negative" | null;
}

async function createConfig(input: { projectId: string; query: string }) {
  const id = crypto.randomUUID();
  const [row] = await db
    .insert(brandMonitorConfigs)
    .values({ id, projectId: input.projectId, query: input.query })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

async function listConfigsByProject(projectId: string) {
  return db.query.brandMonitorConfigs.findMany({
    where: eq(brandMonitorConfigs.projectId, projectId),
    orderBy: [desc(brandMonitorConfigs.createdAt)],
  });
}

async function getConfigForProject(configId: string, projectId: string) {
  const [row] = await db
    .select()
    .from(brandMonitorConfigs)
    .where(
      and(
        eq(brandMonitorConfigs.id, configId),
        eq(brandMonitorConfigs.projectId, projectId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function touchLastChecked(configId: string, nowIso: string) {
  await db
    .update(brandMonitorConfigs)
    .set({ lastCheckedAt: nowIso })
    .where(eq(brandMonitorConfigs.id, configId));
}

async function upsertMentions(configId: string, mentions: UpsertableMention[]) {
  let inserted = 0;
  for (const mention of mentions) {
    const result = await db
      .insert(brandMentions)
      .values({
        configId,
        source: "gdelt",
        sourceId: mention.sourceId,
        title: mention.title,
        url: mention.url,
        snippet: mention.snippet,
        publishedAt: mention.publishedAt,
        sentimentScore: mention.sentimentScore,
        sentimentLabel: mention.sentimentLabel,
      })
      .onConflictDoNothing()
      .returning({ id: brandMentions.id });
    if (result.length > 0) inserted += 1;
  }
  return inserted;
}

async function listMentions(
  configId: string,
  options: {
    sentimentFilter?: "all" | "positive" | "neutral" | "negative";
    limit: number;
    offset: number;
  },
) {
  const conditions = [eq(brandMentions.configId, configId)];
  if (options.sentimentFilter && options.sentimentFilter !== "all") {
    conditions.push(eq(brandMentions.sentimentLabel, options.sentimentFilter));
  }
  return db
    .select()
    .from(brandMentions)
    .where(and(...conditions))
    .orderBy(desc(brandMentions.publishedAt))
    .limit(options.limit)
    .offset(options.offset);
}

export const BrandMonitoringRepository = {
  createConfig,
  listConfigsByProject,
  getConfigForProject,
  touchLastChecked,
  upsertMentions,
  listMentions,
} as const;
