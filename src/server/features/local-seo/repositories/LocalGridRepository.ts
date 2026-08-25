import { and, count, eq, inArray, isNull, or } from "drizzle-orm";
import type { InferInsertModel } from "drizzle-orm";
import { db } from "@/db";
import { runBatch } from "@/db/runBatch";
import {
  localBusinesses,
  localGridConfigs,
  localGridKeywords,
} from "@/db/schema";

async function findBusinessByStableIdentifiers(input: {
  projectId: string;
  placeId?: string | null;
  cid?: string | null;
  featureId?: string | null;
}) {
  const matches = [
    input.placeId ? eq(localBusinesses.placeId, input.placeId) : undefined,
    input.cid ? eq(localBusinesses.cid, input.cid) : undefined,
    input.featureId
      ? eq(localBusinesses.featureId, input.featureId)
      : undefined,
  ].filter((value): value is NonNullable<typeof value> => value !== undefined);

  if (matches.length === 0) return null;
  const [business] = await db
    .select()
    .from(localBusinesses)
    .where(and(eq(localBusinesses.projectId, input.projectId), or(...matches)))
    .limit(1);
  return business ?? null;
}

async function updateBusiness(
  businessId: string,
  projectId: string,
  data: Partial<InferInsertModel<typeof localBusinesses>>,
) {
  await db
    .update(localBusinesses)
    .set(data)
    .where(
      and(
        eq(localBusinesses.id, businessId),
        eq(localBusinesses.projectId, projectId),
      ),
    );
}

async function createConfig(input: {
  business?: InferInsertModel<typeof localBusinesses>;
  config: InferInsertModel<typeof localGridConfigs>;
  keywords: Array<InferInsertModel<typeof localGridKeywords>>;
}) {
  await runBatch((tx) => [
    ...(input.business
      ? [tx.insert(localBusinesses).values(input.business)]
      : []),
    tx.insert(localGridConfigs).values(input.config),
    ...input.keywords.map((keyword) =>
      tx.insert(localGridKeywords).values(keyword),
    ),
  ]);
}

async function listConfigs(projectId: string) {
  const rows = await db
    .select({
      config: localGridConfigs,
      business: localBusinesses,
    })
    .from(localGridConfigs)
    .innerJoin(
      localBusinesses,
      eq(localGridConfigs.businessId, localBusinesses.id),
    )
    .where(
      and(
        eq(localGridConfigs.projectId, projectId),
        isNull(localGridConfigs.archivedAt),
      ),
    )
    .orderBy(localGridConfigs.createdAt);

  if (rows.length === 0) return [];
  const configIds = rows.map((row) => row.config.id);
  const keywordCounts = await db
    .select({ configId: localGridKeywords.configId, value: count() })
    .from(localGridKeywords)
    .where(inArray(localGridKeywords.configId, configIds))
    .groupBy(localGridKeywords.configId);
  const counts = new Map(
    keywordCounts.map((row) => [row.configId, Number(row.value)]),
  );

  return rows.map((row) => ({
    ...row,
    keywordCount: counts.get(row.config.id) ?? 0,
  }));
}

async function getConfig(configId: string, projectId: string) {
  const [row] = await db
    .select({
      config: localGridConfigs,
      business: localBusinesses,
    })
    .from(localGridConfigs)
    .innerJoin(
      localBusinesses,
      eq(localGridConfigs.businessId, localBusinesses.id),
    )
    .where(
      and(
        eq(localGridConfigs.id, configId),
        eq(localGridConfigs.projectId, projectId),
        isNull(localGridConfigs.archivedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  const keywords = await db
    .select()
    .from(localGridKeywords)
    .where(eq(localGridKeywords.configId, configId))
    .orderBy(localGridKeywords.createdAt);
  return { ...row, keywords };
}

async function updateConfig(input: {
  configId: string;
  projectId: string;
  updates: Partial<InferInsertModel<typeof localGridConfigs>>;
  keywords?: Array<InferInsertModel<typeof localGridKeywords>>;
}) {
  await runBatch((tx) => [
    tx
      .update(localGridConfigs)
      .set(input.updates)
      .where(
        and(
          eq(localGridConfigs.id, input.configId),
          eq(localGridConfigs.projectId, input.projectId),
          isNull(localGridConfigs.archivedAt),
        ),
      ),
    ...(input.keywords
      ? [
          tx
            .delete(localGridKeywords)
            .where(eq(localGridKeywords.configId, input.configId)),
          ...input.keywords.map((keyword) =>
            tx.insert(localGridKeywords).values(keyword),
          ),
        ]
      : []),
  ]);
}

async function archiveConfig(
  configId: string,
  projectId: string,
  archivedAt: string,
) {
  const [row] = await db
    .update(localGridConfigs)
    .set({
      archivedAt,
      updatedAt: archivedAt,
      isActive: false,
      nextScanAt: null,
    })
    .where(
      and(
        eq(localGridConfigs.id, configId),
        eq(localGridConfigs.projectId, projectId),
        isNull(localGridConfigs.archivedAt),
      ),
    )
    .returning({ id: localGridConfigs.id });
  return row ?? null;
}

export const LocalGridRepository = {
  findBusinessByStableIdentifiers,
  updateBusiness,
  createConfig,
  listConfigs,
  getConfig,
  updateConfig,
  archiveConfig,
};
