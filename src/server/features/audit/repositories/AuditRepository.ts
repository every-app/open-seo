/**
 * Data access layer for site audit tables.
 * All D1 interactions for audits, audit_pages, and stored Lighthouse results.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { audits, auditLighthouseResults, auditPages } from "@/db/schema";
import type {
  AuditConfig,
  LighthouseResult,
  StepPageResult,
} from "@/server/lib/audit/types";

const DB_BATCH_SIZE = 100;
type BatchStatement = Parameters<typeof db.batch>[0][number];

async function executeInBatches<T>(
  items: T[],
  buildStatement: (item: T) => BatchStatement,
) {
  for (let i = 0; i < items.length; i += DB_BATCH_SIZE) {
    const chunk = items.slice(i, i + DB_BATCH_SIZE).map(buildStatement);
    const [first, ...rest] = chunk;
    if (!first) continue;
    await db.batch([first, ...rest]);
  }
}

async function createAudit(data: {
  id: string;
  projectId: string;
  startedByUserId: string;
  startUrl: string;
  workflowInstanceId: string;
  config: AuditConfig;
  pagesTotal: number;
  lighthouseTotal: number;
}) {
  await db.insert(audits).values({
    id: data.id,
    projectId: data.projectId,
    startedByUserId: data.startedByUserId,
    startUrl: data.startUrl,
    workflowInstanceId: data.workflowInstanceId,
    config: JSON.stringify(data.config),
    status: "running",
    pagesTotal: data.pagesTotal,
    lighthouseTotal: data.lighthouseTotal,
    currentPhase: "discovery",
  });
}

async function updateAuditProgress(
  auditId: string,
  workflowInstanceId: string,
  data: {
    pagesCrawled?: number;
    pagesTotal?: number;
    lighthouseTotal?: number;
    lighthouseCompleted?: number;
    lighthouseFailed?: number;
    currentPhase?: string;
  },
) {
  await db
    .update(audits)
    .set(data)
    .where(
      and(
        eq(audits.id, auditId),
        eq(audits.workflowInstanceId, workflowInstanceId),
      ),
    );
}

async function completeAudit(
  auditId: string,
  workflowInstanceId: string,
  data: {
    pagesCrawled: number;
    pagesTotal: number;
  },
) {
  await db
    .update(audits)
    .set({
      status: "completed",
      completedAt: new Date().toISOString(),
      currentPhase: "completed",
      ...data,
    })
    .where(
      and(
        eq(audits.id, auditId),
        eq(audits.workflowInstanceId, workflowInstanceId),
      ),
    );
}

async function failAudit(auditId: string, workflowInstanceId: string) {
  await db
    .update(audits)
    .set({
      status: "failed",
      completedAt: new Date().toISOString(),
      currentPhase: "failed",
    })
    .where(
      and(
        eq(audits.id, auditId),
        eq(audits.workflowInstanceId, workflowInstanceId),
      ),
    );
}

async function getAuditForWorkflow(
  auditId: string,
  workflowInstanceId: string,
) {
  return db.query.audits.findFirst({
    where: and(
      eq(audits.id, auditId),
      eq(audits.workflowInstanceId, workflowInstanceId),
    ),
  });
}

async function batchWriteResults(
  auditId: string,
  pages: StepPageResult[],
  lighthouseResults: LighthouseResult[],
) {
  await executeInBatches(pages, (page) =>
    db.insert(auditPages).values({
      id: page.id,
      auditId,
      url: page.url,
      statusCode: page.statusCode,
      redirectUrl: page.redirectUrl,
      title: page.title,
      metaDescription: page.metaDescription,
      canonicalUrl: page.canonicalUrl,
      robotsMeta: page.robotsMeta,
      ogTitle: page.ogTitle,
      ogDescription: page.ogDescription,
      ogImage: page.ogImage,
      h1Count: page.h1Count,
      h2Count: page.h2Count,
      h3Count: page.h3Count,
      h4Count: page.h4Count,
      h5Count: page.h5Count,
      h6Count: page.h6Count,
      headingOrderJson: JSON.stringify(page.headingOrder),
      wordCount: page.wordCount,
      imagesTotal: page.imagesTotal,
      imagesMissingAlt: page.imagesMissingAlt,
      imagesJson: JSON.stringify(page.images),
      internalLinkCount: page.internalLinks.length,
      externalLinkCount: page.externalLinks.length,
      hasStructuredData: page.hasStructuredData,
      hreflangTagsJson: JSON.stringify(page.hreflangTags),
      isIndexable: page.isIndexable,
      responseTimeMs: page.responseTimeMs,
    }),
  );

  if (lighthouseResults.length === 0) {
    return;
  }

  await executeInBatches(lighthouseResults, (result) =>
    db.insert(auditLighthouseResults).values({
      id: crypto.randomUUID(),
      auditId,
      pageId: result.pageId,
      strategy: result.strategy,
      performanceScore: result.performanceScore,
      accessibilityScore: result.accessibilityScore,
      bestPracticesScore: result.bestPracticesScore,
      seoScore: result.seoScore,
      lcpMs: result.lcpMs,
      cls: result.cls,
      inpMs: result.inpMs,
      ttfbMs: result.ttfbMs,
      errorMessage: result.errorMessage ?? null,
      r2Key: result.r2Key ?? null,
      payloadSizeBytes: result.payloadSizeBytes ?? null,
    }),
  );
}

async function getAuditForProject(auditId: string, projectId: string) {
  return db.query.audits.findFirst({
    where: and(eq(audits.id, auditId), eq(audits.projectId, projectId)),
  });
}

async function getAuditsByProject(projectId: string) {
  const rows = await db
    .select({ audit: audits })
    .from(audits)
    .where(eq(audits.projectId, projectId))
    .orderBy(desc(audits.startedAt));

  return rows.map(({ audit }) => audit);
}

async function getAuditCapacityUsageForUser(userId: string) {
  const rows = await db.query.audits.findMany({
    where: eq(audits.startedByUserId, userId),
    columns: {
      pagesTotal: true,
      lighthouseTotal: true,
    },
  });

  return rows.reduce(
    (total, row) => total + row.pagesTotal + row.lighthouseTotal,
    0,
  );
}

async function getAuditResultsForProject(auditId: string, projectId: string) {
  const audit = await getAuditForProject(auditId, projectId);
  if (!audit) {
    return { audit: null, pages: [], lighthouse: [] };
  }

  const [pages, lighthouse] = await Promise.all([
    db.query.auditPages.findMany({
      where: eq(auditPages.auditId, auditId),
    }),
    db.query.auditLighthouseResults.findMany({
      where: eq(auditLighthouseResults.auditId, auditId),
    }),
  ]);

  return { audit, pages, lighthouse };
}

async function getLighthouseResultById(input: {
  lighthouseResultId: string;
  projectId: string;
}) {
  const lighthouse = await db.query.auditLighthouseResults.findFirst({
    where: eq(auditLighthouseResults.id, input.lighthouseResultId),
  });

  if (!lighthouse) {
    return null;
  }

  const [parentAudit, page] = await Promise.all([
    db.query.audits.findFirst({
      where: and(
        eq(audits.id, lighthouse.auditId),
        eq(audits.projectId, input.projectId),
      ),
    }),
    db.query.auditPages.findFirst({
      where: eq(auditPages.id, lighthouse.pageId),
    }),
  ]);

  if (!parentAudit) {
    return null;
  }

  return {
    lighthouse,
    page,
    audit: parentAudit,
  };
}

async function deleteAuditForProject(auditId: string, projectId: string) {
  await db
    .delete(audits)
    .where(and(eq(audits.id, auditId), eq(audits.projectId, projectId)));
}

export const AuditRepository = {
  createAudit,
  updateAuditProgress,
  completeAudit,
  failAudit,
  getAuditForWorkflow,
  batchWriteResults,
  getAuditForProject,
  getAuditsByProject,
  getAuditCapacityUsageForUser,
  getAuditResultsForProject,
  getLighthouseResultById,
  deleteAuditForProject,
} as const;
