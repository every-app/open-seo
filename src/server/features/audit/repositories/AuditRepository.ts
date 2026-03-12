/**
 * Data access layer for site audit tables.
 * All D1 interactions for audits, audit_pages, and audit_psi_results.
 */
import { db } from "@/db";
import { audits, auditPages, auditPsiResults, projects } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import type { PsiResult, AuditConfig } from "@/server/lib/audit/types";

// ─── Create ──────────────────────────────────────────────────────────────────

async function createAudit(data: {
  id: string;
  projectId: string;
  userId: string;
  startUrl: string;
  workflowInstanceId: string;
  config: AuditConfig;
}) {
  await db.insert(audits).values({
    id: data.id,
    projectId: data.projectId,
    userId: data.userId,
    startUrl: data.startUrl,
    workflowInstanceId: data.workflowInstanceId,
    config: JSON.stringify(data.config),
    status: "running",
  });
}

// ─── Update ──────────────────────────────────────────────────────────────────

async function updateAuditProgress(
  auditId: string,
  workflowInstanceId: string,
  data: {
    pagesCrawled?: number;
    pagesTotal?: number;
    psiTotal?: number;
    psiCompleted?: number;
    psiFailed?: number;
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

// ─── Batch write results (finalize step) ─────────────────────────────────────

/**
 * Use db.batch() to send individual INSERT statements in a single round-trip.
 * D1's batch API supports up to 100 *statements* per call — each statement
 * has its own bind params, so there's no per-statement param limit issue.
 */
async function batchWriteResults(
  auditId: string,
  pages: Array<{
    id: string;
    url: string;
    statusCode: number;
    redirectUrl: string | null;
    title: string;
    metaDescription: string;
    canonicalUrl: string | null;
    robotsMeta: string | null;
    ogTitle: string | null;
    ogDescription: string | null;
    ogImage: string | null;
    h1Count: number;
    h2Count: number;
    h3Count: number;
    h4Count: number;
    h5Count: number;
    h6Count: number;
    headingOrder: number[];
    wordCount: number;
    imagesTotal: number;
    imagesMissingAlt: number;
    images: Array<{ src: string | null; alt: string | null }>;
    internalLinks: string[];
    externalLinks: string[];
    hasStructuredData: boolean;
    hreflangTags: string[];
    isIndexable: boolean;
    responseTimeMs: number;
  }>,
  psiResults: PsiResult[],
) {
  const BATCH_SIZE = 100; // D1 max statements per batch() call

  // ── Pages ──────────────────────────────────────────────────────────
  const pageStatements = pages.map((p) =>
    db.insert(auditPages).values({
      id: p.id,
      auditId,
      url: p.url,
      statusCode: p.statusCode,
      redirectUrl: p.redirectUrl,
      // Metadata
      title: p.title,
      metaDescription: p.metaDescription,
      canonicalUrl: p.canonicalUrl,
      robotsMeta: p.robotsMeta,
      // Open Graph
      ogTitle: p.ogTitle,
      ogDescription: p.ogDescription,
      ogImage: p.ogImage,
      // Headings
      h1Count: p.h1Count,
      h2Count: p.h2Count,
      h3Count: p.h3Count,
      h4Count: p.h4Count,
      h5Count: p.h5Count,
      h6Count: p.h6Count,
      headingOrderJson: JSON.stringify(p.headingOrder),
      // Content
      wordCount: p.wordCount,
      // Images
      imagesTotal: p.imagesTotal,
      imagesMissingAlt: p.imagesMissingAlt,
      imagesJson: JSON.stringify(p.images),
      // Links
      internalLinkCount: p.internalLinks.length,
      externalLinkCount: p.externalLinks.length,
      // Structured data
      hasStructuredData: p.hasStructuredData,
      // Hreflang
      hreflangTagsJson: JSON.stringify(p.hreflangTags),
      // Indexability
      isIndexable: p.isIndexable,
      // Performance
      responseTimeMs: p.responseTimeMs,
    }),
  );

  for (let i = 0; i < pageStatements.length; i += BATCH_SIZE) {
    const chunk = pageStatements.slice(i, i + BATCH_SIZE);
    const [first, ...rest] = chunk;
    await db.batch([first, ...rest]);
  }

  // ── PSI results ────────────────────────────────────────────────────
  if (psiResults.length > 0) {
    const psiStatements = psiResults.map((r) =>
      db.insert(auditPsiResults).values({
        id: crypto.randomUUID(),
        auditId,
        pageId: r.pageId,
        strategy: r.strategy,
        performanceScore: r.performanceScore,
        accessibilityScore: r.accessibilityScore,
        bestPracticesScore: r.bestPracticesScore,
        seoScore: r.seoScore,
        lcpMs: r.lcpMs,
        cls: r.cls,
        inpMs: r.inpMs,
        ttfbMs: r.ttfbMs,
        errorMessage: r.errorMessage ?? null,
        r2Key: r.r2Key ?? null,
        payloadSizeBytes: r.payloadSizeBytes ?? null,
      }),
    );

    for (let i = 0; i < psiStatements.length; i += BATCH_SIZE) {
      const chunk = psiStatements.slice(i, i + BATCH_SIZE);
      const [first, ...rest] = chunk;
      await db.batch([first, ...rest]);
    }
  }
}

// ─── Read ────────────────────────────────────────────────────────────────────

async function isProjectOwnedByUser(projectId: string, userId: string) {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
  });
  return Boolean(project);
}

async function getAuditForUser(auditId: string, userId: string) {
  return db.query.audits.findFirst({
    where: and(eq(audits.id, auditId), eq(audits.userId, userId)),
  });
}

async function getAuditsByProjectForUser(projectId: string, userId: string) {
  return db.query.audits.findMany({
    where: and(eq(audits.projectId, projectId), eq(audits.userId, userId)),
    orderBy: [desc(audits.startedAt)],
  });
}

async function getAuditResultsForUser(auditId: string, userId: string) {
  const audit = await getAuditForUser(auditId, userId);
  if (!audit) {
    return { audit: null, pages: [], psi: [] };
  }

  const [pages, psi] = await Promise.all([
    db.query.auditPages.findMany({
      where: eq(auditPages.auditId, auditId),
    }),
    db.query.auditPsiResults.findMany({
      where: eq(auditPsiResults.auditId, auditId),
    }),
  ]);

  return { audit, pages, psi };
}

async function getPsiResultById(input: {
  psiResultId: string;
  projectId: string;
  userId: string;
}) {
  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, input.projectId),
      eq(projects.userId, input.userId),
    ),
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const psi = await db.query.auditPsiResults.findFirst({
    where: eq(auditPsiResults.id, input.psiResultId),
  });

  if (!psi) return null;

  const parentAudit = await db.query.audits.findFirst({
    where: and(
      eq(audits.id, psi.auditId),
      eq(audits.projectId, input.projectId),
      eq(audits.userId, input.userId),
    ),
  });

  if (!parentAudit) {
    throw new Error("Audit not found");
  }

  const page = await db.query.auditPages.findFirst({
    where: eq(auditPages.id, psi.pageId),
  });

  return {
    psi,
    page,
    audit: parentAudit,
  };
}

// ─── Delete ──────────────────────────────────────────────────────────────────

async function deleteAuditForUser(auditId: string, userId: string) {
  // Cascading deletes handle child tables
  await db
    .delete(audits)
    .where(and(eq(audits.id, auditId), eq(audits.userId, userId)));
}

// ─── Export ──────────────────────────────────────────────────────────────────

export const AuditRepository = {
  createAudit,
  updateAuditProgress,
  completeAudit,
  failAudit,
  getAuditForWorkflow,
  batchWriteResults,
  isProjectOwnedByUser,
  getAuditForUser,
  getAuditsByProjectForUser,
  getAuditResultsForUser,
  getPsiResultById,
  deleteAuditForUser,
} as const;
