/**
 * Cross-page (multipage) issue checks over the app DB's page rows:
 * duplicates and redirect chains/loops. Pure set-queries over crawl data —
 * no fetching, no DOM.
 *
 * The two link-edge checks (broken-internal-link, orphan-page) live in the
 * audit's scratchpad Durable Object (AuditScratchpad.runFinalizeChecks),
 * next to the link edges themselves — link rows never touch the app DB.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditPages } from "@/db/schema";
import {
  findDuplicates,
  findRedirectChainsAndLoops,
  type SlimPage,
} from "@/server/lib/audit/issues/multipage-checks";
import type { DetectedIssue } from "@/server/lib/audit/issues/page-reporters";

export async function runMultipageChecks(input: {
  auditId: string;
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

  return [...findDuplicates(pages), ...findRedirectChainsAndLoops(pages)];
}
