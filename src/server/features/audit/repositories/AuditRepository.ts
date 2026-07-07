/**
 * Data access layer for site audit tables.
 * Provider-aware (D1 or Postgres) via the `@/db` handle. Covers audits,
 * audit_pages, audit_links, audit_issues, and stored Lighthouse results.
 */
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  audits,
  auditIssues,
  auditLighthouseResults,
  auditLinks,
  auditPages,
} from "@/db/schema";
import { executeInBatches } from "@/db/runBatch";
import { AUDIT_ISSUE_TYPES } from "@/shared/audit-issues";
import { deterministicAuditRowId } from "@/server/lib/audit/ids";
import type { DetectedIssue } from "@/server/lib/audit/issues/page-reporters";
import type {
  AuditConfig,
  CrawledPageResult,
  LighthouseResult,
} from "@/server/lib/audit/types";

// Only internal links are stored: both consumers (broken-internal-link and
// orphan checks) filter on isInternal, and per-page external counts already
// live on audit_pages. External rows come back when P1 adds external-link
// checks. Mega-menu/footer-heavy sites can carry 1000+ links per page; cap
// what we store so a 10k-page crawl can't write tens of millions of link rows.
const MAX_STORED_LINKS_PER_PAGE = 500;

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
  // Only a running audit can transition to failed: the getStatus reconciler
  // races the workflow's own finalize, and without this guard it could flip
  // a just-completed audit to failed.
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
        eq(audits.status, "running"),
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

/**
 * Persist one crawl batch (pages + link edges + per-page issues).
 * Called inside the crawl-batch Workflow step so results land in D1
 * incrementally instead of accumulating in memory until finalize.
 *
 * Idempotent on step retry: callers assign deterministic page ids
 * (deterministicAuditRowId) and link/issue ids are derived from stable
 * content. Page rows upsert (a retried fetch may legitimately differ — last
 * attempt wins, matching what the step returns); links and issues are
 * insert-or-ignore.
 */
async function insertCrawledBatch(
  auditId: string,
  pages: CrawledPageResult[],
  issues: DetectedIssue[],
) {
  await executeInBatches(pages, (tx, page) => {
    const dataColumns = {
      url: page.url,
      statusCode: page.statusCode,
      redirectUrl: page.redirectUrl,
      title: page.title,
      metaDescription: page.metaDescription,
      canonicalUrl: page.canonicalUrl,
      robotsMeta: page.robotsMeta,
      xRobotsTag: page.xRobotsTag,
      headerCanonicalUrl: page.headerCanonicalUrl,
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
      contentHash: page.contentHash,
      imagesTotal: page.imagesTotal,
      imagesMissingAlt: page.imagesMissingAlt,
      imagesJson: JSON.stringify(page.images),
      internalLinkCount: page.links.filter((l) => l.isInternal).length,
      externalLinkCount: page.links.filter((l) => !l.isInternal).length,
      hasStructuredData: page.hasStructuredData,
      hreflangTagsJson: JSON.stringify(page.hreflangTags),
      isIndexable: page.isIndexable,
      fetchClass: page.fetchClass,
      crawlDepth: page.crawlDepth,
      inSitemap: page.inSitemap,
      responseTimeMs: page.responseTimeMs,
    };
    return tx
      .insert(auditPages)
      .values({ id: page.id, auditId, ...dataColumns })
      .onConflictDoUpdate({ target: auditPages.id, set: dataColumns });
  });

  const linkRows = await Promise.all(
    pages.flatMap((page) =>
      page.links
        .filter((link) => link.isInternal)
        .slice(0, MAX_STORED_LINKS_PER_PAGE)
        .map(async (link) => ({
          id: await deterministicAuditRowId(auditId, page.url, link.targetUrl),
          auditId,
          sourcePageId: page.id,
          sourceUrl: page.url,
          targetUrl: link.targetUrl,
          anchor: link.anchor,
          isInternal: link.isInternal,
          isNofollow: link.isNofollow,
        })),
    ),
  );
  await executeInBatches(linkRows, (tx, row) =>
    tx.insert(auditLinks).values(row).onConflictDoNothing(),
  );

  await insertIssues(auditId, issues);
}

async function insertIssues(auditId: string, issues: DetectedIssue[]) {
  const issueRows = await Promise.all(
    issues.map(async (issue) => ({
      id: await deterministicAuditRowId(
        auditId,
        issue.pageUrl,
        issue.issueType,
        issue.dedupeKey ?? "",
      ),
      auditId,
      pageId: issue.pageId,
      pageUrl: issue.pageUrl,
      issueType: issue.issueType,
      severity: AUDIT_ISSUE_TYPES[issue.issueType].severity,
      detailsJson: issue.details ? JSON.stringify(issue.details) : null,
    })),
  );
  await executeInBatches(issueRows, (tx, row) =>
    tx.insert(auditIssues).values(row).onConflictDoNothing(),
  );
}

async function insertLighthouseResults(
  auditId: string,
  lighthouseResults: LighthouseResult[],
) {
  const rows = await Promise.all(
    lighthouseResults.map(async (result) => ({
      id: await deterministicAuditRowId(
        auditId,
        result.pageId,
        result.strategy,
      ),
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
    })),
  );
  // Upsert: a step retry can charge a second DataForSEO call whose result
  // must not be silently dropped in favor of a failed first attempt.
  await executeInBatches(rows, (tx, row) => {
    const { id: _id, auditId: _auditId, ...dataColumns } = row;
    return tx.insert(auditLighthouseResults).values(row).onConflictDoUpdate({
      target: auditLighthouseResults.id,
      set: dataColumns,
    });
  });
}

async function getAuditForProject(auditId: string, projectId: string) {
  return db.query.audits.findFirst({
    where: and(eq(audits.id, auditId), eq(audits.projectId, projectId)),
  });
}

async function getLatestAuditForProject(projectId: string) {
  return db.query.audits.findFirst({
    where: eq(audits.projectId, projectId),
    orderBy: desc(audits.startedAt),
  });
}

async function getIssuesForAudit(
  auditId: string,
  filters: { severity?: "critical" | "warning" | "info"; issueType?: string },
) {
  return db.query.auditIssues.findMany({
    where: and(
      eq(auditIssues.auditId, auditId),
      filters.severity ? eq(auditIssues.severity, filters.severity) : undefined,
      filters.issueType
        ? eq(auditIssues.issueType, filters.issueType)
        : undefined,
    ),
  });
}

async function getPagesForAudit(auditId: string) {
  return db
    .select({
      id: auditPages.id,
      url: auditPages.url,
      statusCode: auditPages.statusCode,
      fetchClass: auditPages.fetchClass,
      redirectUrl: auditPages.redirectUrl,
      title: auditPages.title,
      metaDescription: auditPages.metaDescription,
      wordCount: auditPages.wordCount,
      isIndexable: auditPages.isIndexable,
      crawlDepth: auditPages.crawlDepth,
      inSitemap: auditPages.inSitemap,
      internalLinkCount: auditPages.internalLinkCount,
      responseTimeMs: auditPages.responseTimeMs,
    })
    .from(auditPages)
    .where(eq(auditPages.auditId, auditId));
}

async function hasPagesForAudit(auditId: string): Promise<boolean> {
  const rows = await db
    .select({ id: auditPages.id })
    .from(auditPages)
    .where(eq(auditPages.auditId, auditId))
    .limit(1);
  return rows.length > 0;
}

async function getAuditsByProject(projectId: string) {
  const rows = await db
    .select({ audit: audits })
    .from(audits)
    .where(eq(audits.projectId, projectId))
    .orderBy(desc(audits.startedAt));

  return rows.map(({ audit }) => audit);
}

async function getAuditUsageForUser(userId: string) {
  const rows = await db.query.audits.findMany({
    where: eq(audits.startedByUserId, userId),
    columns: {
      status: true,
      pagesTotal: true,
      lighthouseTotal: true,
    },
  });

  return {
    capacityUnits: rows.reduce(
      (total, row) => total + row.pagesTotal + row.lighthouseTotal,
      0,
    ),
    runningCount: rows.filter((row) => row.status === "running").length,
  };
}

async function getAuditResultsForProject(auditId: string, projectId: string) {
  const audit = await getAuditForProject(auditId, projectId);
  if (!audit) {
    return { audit: null, pages: [], lighthouse: [], issues: [] };
  }

  const [pages, lighthouse, issues] = await Promise.all([
    db.query.auditPages.findMany({
      where: eq(auditPages.auditId, auditId),
    }),
    db.query.auditLighthouseResults.findMany({
      where: eq(auditLighthouseResults.auditId, auditId),
    }),
    db.query.auditIssues.findMany({
      where: eq(auditIssues.auditId, auditId),
    }),
  ]);

  return { audit, pages, lighthouse, issues };
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
  insertCrawledBatch,
  insertIssues,
  insertLighthouseResults,
  getAuditForProject,
  getLatestAuditForProject,
  getIssuesForAudit,
  getPagesForAudit,
  hasPagesForAudit,
  getAuditsByProject,
  getAuditUsageForUser,
  getAuditResultsForProject,
  getLighthouseResultById,
  deleteAuditForProject,
} as const;
