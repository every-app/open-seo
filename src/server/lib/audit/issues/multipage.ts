/**
 * Cross-page (multipage) issue checks.
 *
 * These run once after the crawl, against the rows the crawl wrote to D1:
 * duplicates, broken internal links, redirect chains/loops, orphan pages.
 * Pure set-queries over crawl data — no fetching, no DOM.
 */
import { and, eq, gte, lt, ne, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import { auditLinks, auditPages } from "@/db/schema";
import { normalizeUrl } from "@/server/lib/audit/url-utils";
import {
  findDuplicates,
  findRedirectChainsAndLoops,
  type SlimPage,
} from "@/server/lib/audit/issues/multipage-checks";
import type { DetectedIssue } from "@/server/lib/audit/issues/page-reporters";

const BROKEN_LINK_ISSUE_CAP = 2_000;

export async function runMultipageChecks(input: {
  auditId: string;
  startUrl: string;
  /** Orphan detection only makes sense when the crawl wasn't truncated. */
  crawlCompleted: boolean;
}): Promise<DetectedIssue[]> {
  const pages: SlimPage[] = await db
    .select({
      id: auditPages.id,
      url: auditPages.url,
      statusCode: auditPages.statusCode,
      fetchClass: auditPages.fetchClass,
      title: auditPages.title,
      metaDescription: auditPages.metaDescription,
      contentHash: auditPages.contentHash,
      redirectUrl: auditPages.redirectUrl,
      wordCount: auditPages.wordCount,
      isIndexable: auditPages.isIndexable,
      canonicalUrl: auditPages.canonicalUrl,
      headerCanonicalUrl: auditPages.headerCanonicalUrl,
    })
    .from(auditPages)
    .where(eq(auditPages.auditId, input.auditId));

  const issues: DetectedIssue[] = [
    ...findDuplicates(pages),
    ...findRedirectChainsAndLoops(pages),
    ...(await findBrokenInternalLinks(input.auditId)),
  ];

  if (input.crawlCompleted) {
    // Page rows store normalized URLs; normalize the start URL the same way
    // so the orphan exclusion matches.
    const normalizedStart = normalizeUrl(input.startUrl) ?? input.startUrl;
    issues.push(...(await findOrphanPages(input.auditId, normalizedStart)));
  }

  return issues;
}

async function findBrokenInternalLinks(
  auditId: string,
): Promise<DetectedIssue[]> {
  // Only flag targets we actually crawled and saw fail — never inferred from
  // absence. Blocked targets (WAF challenges) are excluded: a 403 from bot
  // protection is not evidence of a broken link.
  const rows = await db
    .select({
      sourcePageId: auditLinks.sourcePageId,
      sourceUrl: auditLinks.sourceUrl,
      targetUrl: auditLinks.targetUrl,
      targetStatus: auditPages.statusCode,
    })
    .from(auditLinks)
    .innerJoin(
      auditPages,
      and(
        eq(auditPages.auditId, auditLinks.auditId),
        eq(auditPages.url, auditLinks.targetUrl),
      ),
    )
    .where(
      and(
        eq(auditLinks.auditId, auditId),
        eq(auditLinks.isInternal, true),
        gte(auditPages.statusCode, 400),
        eq(auditPages.fetchClass, "ok"),
      ),
    )
    .limit(BROKEN_LINK_ISSUE_CAP);

  return rows.map((row) => ({
    issueType: "broken-internal-link" as const,
    pageId: row.sourcePageId,
    pageUrl: row.sourceUrl,
    dedupeKey: row.targetUrl,
    details: { targetUrl: row.targetUrl, targetStatus: row.targetStatus },
  }));
}

async function findOrphanPages(
  auditId: string,
  startUrl: string,
): Promise<DetectedIssue[]> {
  // A live 2xx page is an orphan when no OTHER crawled page links to it and
  // nothing redirects to it. Only meaningful on a completed crawl: on a
  // truncated one, "no observed inlinks" is true of nearly everything.
  // Error/redirect rows aren't orphans — they already get their own issues.
  const inlink = db
    .select({ one: sql`1` })
    .from(auditLinks)
    .where(
      and(
        eq(auditLinks.auditId, auditId),
        eq(auditLinks.isInternal, true),
        eq(auditLinks.targetUrl, auditPages.url),
        // Self-links (breadcrumbs, anchors) don't make a page reachable.
        ne(auditLinks.sourcePageId, auditPages.id),
      ),
    );

  const redirectSourcePages = alias(auditPages, "redirect_sources");
  const redirectSources = db
    .select({ one: sql`1` })
    .from(redirectSourcePages)
    .where(
      and(
        eq(redirectSourcePages.auditId, auditId),
        eq(redirectSourcePages.redirectUrl, auditPages.url),
      ),
    );

  const rows = await db
    .select({ id: auditPages.id, url: auditPages.url })
    .from(auditPages)
    .where(
      and(
        eq(auditPages.auditId, auditId),
        ne(auditPages.url, startUrl),
        eq(auditPages.fetchClass, "ok"),
        gte(auditPages.statusCode, 200),
        lt(auditPages.statusCode, 300),
        notExists(inlink),
        notExists(redirectSources),
      ),
    );

  return rows.map((row) => ({
    issueType: "orphan-page" as const,
    pageId: row.id,
    pageUrl: row.url,
  }));
}
