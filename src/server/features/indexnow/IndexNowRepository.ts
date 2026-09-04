import { and, desc, eq } from "drizzle-orm";
import { sort } from "remeda";
import { db } from "@/db";
import { indexNowConfigs, indexNowSubmissions, projects } from "@/db/schema";

type IndexNowConfig = typeof indexNowConfigs.$inferSelect;

async function getProjectDomain(projectId: string): Promise<string | null> {
  const [row] = await db
    .select({ domain: projects.domain })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row?.domain ?? null;
}

async function getConfig(projectId: string): Promise<IndexNowConfig | null> {
  const [row] = await db
    .select()
    .from(indexNowConfigs)
    .where(eq(indexNowConfigs.projectId, projectId))
    .limit(1);
  return row ?? null;
}

async function upsertConfig(input: {
  projectId: string;
  organizationId: string;
  publicKey: string;
  keyLocation: string;
  generatedByUserId: string;
  now: string;
}) {
  const existing = await getConfig(input.projectId);
  await db
    .insert(indexNowConfigs)
    .values({
      id: existing?.id ?? crypto.randomUUID(),
      projectId: input.projectId,
      organizationId: input.organizationId,
      publicKey: input.publicKey,
      keyLocation: input.keyLocation,
      generatedByUserId: input.generatedByUserId,
      keyVerifiedAt: null,
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: indexNowConfigs.projectId,
      set: {
        organizationId: input.organizationId,
        publicKey: input.publicKey,
        keyLocation: input.keyLocation,
        keyVerifiedAt: null,
        generatedByUserId: input.generatedByUserId,
        updatedAt: input.now,
      },
    });
  return (await getConfig(input.projectId))!;
}

async function markVerified(input: {
  configId: string;
  publicKey: string;
  verifiedAt: string;
}) {
  const rows = await db
    .update(indexNowConfigs)
    .set({ keyVerifiedAt: input.verifiedAt, updatedAt: input.verifiedAt })
    .where(
      and(
        eq(indexNowConfigs.id, input.configId),
        eq(indexNowConfigs.publicKey, input.publicKey),
      ),
    )
    .returning({ publicKey: indexNowConfigs.publicKey });
  return rows[0]?.publicKey === input.publicKey;
}

async function recordSubmission(input: {
  projectId: string;
  configId: string;
  status: string;
  requestedUrlCount: number;
  uniqueUrlCount: number;
  chunkCount: number;
  receivedChunkCount: number;
  pendingChunkCount: number;
  rejectedChunkCount: number;
  failedChunkCount: number;
  httpStatuses: number[];
  submittedByUserId: string;
  createdAt: string;
}) {
  const id = crypto.randomUUID();
  await db.insert(indexNowSubmissions).values({
    id,
    projectId: input.projectId,
    configId: input.configId,
    status: input.status,
    requestedUrlCount: input.requestedUrlCount,
    uniqueUrlCount: input.uniqueUrlCount,
    chunkCount: input.chunkCount,
    receivedChunkCount: input.receivedChunkCount,
    pendingChunkCount: input.pendingChunkCount,
    rejectedChunkCount: input.rejectedChunkCount,
    failedChunkCount: input.failedChunkCount,
    httpStatusesJson: JSON.stringify(
      sort([...new Set(input.httpStatuses)], (left, right) => left - right),
    ),
    submittedByUserId: input.submittedByUserId,
    createdAt: input.createdAt,
  });
  return id;
}

async function listRecentSubmissions(projectId: string) {
  return db
    .select({
      id: indexNowSubmissions.id,
      status: indexNowSubmissions.status,
      requestedUrlCount: indexNowSubmissions.requestedUrlCount,
      uniqueUrlCount: indexNowSubmissions.uniqueUrlCount,
      chunkCount: indexNowSubmissions.chunkCount,
      receivedChunkCount: indexNowSubmissions.receivedChunkCount,
      pendingChunkCount: indexNowSubmissions.pendingChunkCount,
      rejectedChunkCount: indexNowSubmissions.rejectedChunkCount,
      failedChunkCount: indexNowSubmissions.failedChunkCount,
      createdAt: indexNowSubmissions.createdAt,
    })
    .from(indexNowSubmissions)
    .where(eq(indexNowSubmissions.projectId, projectId))
    .orderBy(desc(indexNowSubmissions.createdAt))
    .limit(10);
}

export const IndexNowRepository = {
  getProjectDomain,
  getConfig,
  upsertConfig,
  markVerified,
  recordSubmission,
  listRecentSubmissions,
};
