/**
 * Reads behind the audit results page and the MCP audit tools. An audit can hold 10,000 pages and
 * tens of thousands of issues, so nothing here loads every row: the summary
 * is aggregates, and pages and issues come one page at a time.
 * Lives beside AuditRepository (like auditSummaryQueries) to keep that file
 * under the file-size limit.
 */
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  isNull,
  lt,
  lte,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import { auditIssues, auditLighthouseResults, auditPages } from "@/db/schema";
import type { z } from "zod";
import type { getAuditPagesSchema } from "@/types/schemas/audit";

type AuditPagesParams = Omit<
  z.output<typeof getAuditPagesSchema>,
  "projectId" | "auditId"
> & {
  /** MCP filters: an exact status code, and a URL-only substring. */
  statusCode?: number;
  urlContains?: string;
};

// Enough pages to tell which host most of the site lives on.
const HOST_SAMPLE_SIZE = 1_000;

/** Issue counts per type and stored severity. */
export function getAuditIssueGroups(auditId: string) {
  return db
    .select({
      issueType: auditIssues.issueType,
      severity: auditIssues.severity,
      count: count(),
    })
    .from(auditIssues)
    .where(eq(auditIssues.auditId, auditId))
    .groupBy(auditIssues.issueType, auditIssues.severity);
}

export async function getAuditResultsSummary(auditId: string) {
  const [issueGroups, fetchClassRows, lighthouse, okPageUrls] =
    await Promise.all([
      getAuditIssueGroups(auditId),
      db
        .select({
          fetchClass: auditPages.fetchClass,
          count: count(),
          totalResponseMs:
            sql<number>`coalesce(sum(${auditPages.responseTimeMs}), 0)`.mapWith(
              Number,
            ),
        })
        .from(auditPages)
        .where(eq(auditPages.auditId, auditId))
        .groupBy(auditPages.fetchClass),
      // At most 20 rows (10 sampled pages, mobile + desktop).
      db
        .select({
          ...getTableColumns(auditLighthouseResults),
          pageUrl: auditPages.url,
        })
        .from(auditLighthouseResults)
        .leftJoin(auditPages, eq(auditPages.id, auditLighthouseResults.pageId))
        .where(eq(auditLighthouseResults.auditId, auditId)),
      db
        .select({ url: auditPages.url })
        .from(auditPages)
        .where(
          and(
            eq(auditPages.auditId, auditId),
            gte(auditPages.statusCode, 200),
            lt(auditPages.statusCode, 300),
          ),
        )
        .limit(HOST_SAMPLE_SIZE),
    ]);

  return { issueGroups, fetchClassRows, lighthouse, okPageUrls };
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function containsText(column: AnyColumn, needle: string) {
  return sql`lower(${column}) like ${`%${escapeLike(needle)}%`} escape '\\'`;
}

function buildPagesWhere(auditId: string, params: AuditPagesParams) {
  const clauses: (SQL | undefined)[] = [eq(auditPages.auditId, auditId)];
  const query = params.query?.toLocaleLowerCase();
  if (query) {
    clauses.push(
      or(
        containsText(auditPages.url, query),
        containsText(auditPages.title, query),
        containsText(auditPages.metaDescription, query),
      ),
    );
  }
  if (params.urlContains) {
    clauses.push(
      containsText(auditPages.url, params.urlContains.toLocaleLowerCase()),
    );
  }
  if (params.statusCode !== undefined) {
    clauses.push(eq(auditPages.statusCode, params.statusCode));
  }
  if (params.status === "missing") clauses.push(isNull(auditPages.statusCode));
  if (params.status === "ok") {
    clauses.push(
      gte(auditPages.statusCode, 200),
      lt(auditPages.statusCode, 300),
    );
  }
  if (params.status === "redirect") {
    clauses.push(
      gte(auditPages.statusCode, 300),
      lt(auditPages.statusCode, 400),
    );
  }
  if (params.status === "error") clauses.push(gte(auditPages.statusCode, 400));
  if (params.fetchClass !== "all") {
    clauses.push(eq(auditPages.fetchClass, params.fetchClass));
  }
  // A bound excludes pages with no value, like the old client-side filter.
  if (params.minWords != null) {
    clauses.push(gte(auditPages.wordCount, params.minWords));
  }
  if (params.maxWords != null) {
    clauses.push(lte(auditPages.wordCount, params.maxWords));
  }
  if (params.minResponseMs != null) {
    clauses.push(gte(auditPages.responseTimeMs, params.minResponseMs));
  }
  if (params.maxResponseMs != null) {
    clauses.push(lte(auditPages.responseTimeMs, params.maxResponseMs));
  }
  if (params.missingAlt === "yes") {
    clauses.push(sql`${auditPages.imagesMissingAlt} > 0`);
  }
  if (params.missingAlt === "no") {
    clauses.push(sql`${auditPages.imagesMissingAlt} <= 0`);
  }
  return and(...clauses);
}

// Blank values sort last in both directions, as the table did client-side.
function buildPagesOrderBy(params: AuditPagesParams): SQL[] {
  const direction = params.order === "desc" ? desc : asc;
  const nullableLast = (column: AnyColumn) => [
    sql`${column} is null`,
    direction(column),
  ];
  const sortKeys: Record<AuditPagesParams["sort"], SQL[]> = {
    url: [direction(auditPages.url)],
    statusCode: nullableLast(auditPages.statusCode),
    title: [
      sql`coalesce(${auditPages.title}, '') = ''`,
      direction(auditPages.title),
    ],
    h1Count: [direction(auditPages.h1Count)],
    wordCount: [direction(auditPages.wordCount)],
    images: [
      direction(auditPages.imagesMissingAlt),
      direction(auditPages.imagesTotal),
    ],
    responseTimeMs: nullableLast(auditPages.responseTimeMs),
  };
  // The id tiebreak keeps rows from repeating or vanishing across pages.
  return [...sortKeys[params.sort], asc(auditPages.id)];
}

export async function listAuditPages(
  auditId: string,
  params: AuditPagesParams,
) {
  const where = buildPagesWhere(auditId, params);
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: auditPages.id,
        url: auditPages.url,
        statusCode: auditPages.statusCode,
        redirectUrl: auditPages.redirectUrl,
        title: auditPages.title,
        metaDescription: auditPages.metaDescription,
        h1Count: auditPages.h1Count,
        wordCount: auditPages.wordCount,
        imagesTotal: auditPages.imagesTotal,
        imagesMissingAlt: auditPages.imagesMissingAlt,
        fetchClass: auditPages.fetchClass,
        responseTimeMs: auditPages.responseTimeMs,
        isIndexable: auditPages.isIndexable,
        crawlDepth: auditPages.crawlDepth,
        inSitemap: auditPages.inSitemap,
        internalLinkCount: auditPages.internalLinkCount,
        // Only a flagged page shows its blank title as "missing": a 200 that
        // isn't HTML (robots.txt) legitimately has none.
        // Table-qualified by hand: Drizzle writes columns unqualified in a
        // one-table select, which would bind both sides to audit_issues.
        missingTitle: sql<boolean>`exists (
          select 1 from audit_issues
          where audit_issues.page_id = audit_pages.id
          and audit_issues.issue_type = 'missing-title'
        )`.mapWith(Boolean),
      })
      .from(auditPages)
      .where(where)
      .orderBy(...buildPagesOrderBy(params))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    db.select({ total: count() }).from(auditPages).where(where),
  ]);
  return { rows, totalCount: totals[0]?.total ?? 0 };
}

export async function listAuditIssues(
  auditId: string,
  params: {
    issueType?: string;
    severity?: "critical" | "warning" | "info";
    page: number;
    pageSize: number;
  },
) {
  return (
    db
      .select({
        id: auditIssues.id,
        pageUrl: auditIssues.pageUrl,
        issueType: auditIssues.issueType,
        severity: auditIssues.severity,
        detailsJson: auditIssues.detailsJson,
      })
      .from(auditIssues)
      .where(
        and(
          eq(auditIssues.auditId, auditId),
          params.issueType
            ? eq(auditIssues.issueType, params.issueType)
            : undefined,
          params.severity
            ? eq(auditIssues.severity, params.severity)
            : undefined,
        ),
      )
      // Severity first, so a cut-off list drops info rows, never critical ones.
      .orderBy(
        sql`case ${auditIssues.severity} when 'critical' then 0 when 'warning' then 1 else 2 end`,
        asc(auditIssues.issueType),
        asc(auditIssues.pageUrl),
        asc(auditIssues.id),
      )
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize)
  );
}
