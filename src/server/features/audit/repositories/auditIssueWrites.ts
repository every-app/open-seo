import { chunk } from "remeda";
import { db } from "@/db";
import { getDatabaseProvider } from "@/db/provider";
import { DB_BATCH_SIZE, runBatch } from "@/db/runBatch";
import { auditIssues } from "@/db/schema";
import { deterministicAuditRowId } from "@/server/lib/audit/ids";
import type { DetectedIssue } from "@/server/lib/audit/issues/page-reporters";
import { AUDIT_ISSUE_TYPES } from "@/shared/audit-issues";

export async function insertIssues(auditId: string, issues: DetectedIssue[]) {
  const isPostgres = getDatabaseProvider() === "postgres";
  // Bound row preparation while preserving D1's 100-row batch requests.
  const batchSize = isPostgres ? 500 : DB_BATCH_SIZE;
  for (let i = 0; i < issues.length; i += batchSize) {
    const issueRows = await Promise.all(
      issues.slice(i, i + batchSize).map(async (issue) => ({
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
    // Each outer batch commits independently. Deterministic IDs let retries
    // skip committed rows without repeating thousands of individual inserts.
    if (isPostgres) {
      await db.insert(auditIssues).values(issueRows).onConflictDoNothing();
    } else {
      // Seven bound columns per row: D1 permits 100 parameters per statement.
      // Send the statements together in one atomic D1 batch request.
      await runBatch((tx) =>
        chunk(issueRows, 14).map((rows) =>
          tx.insert(auditIssues).values(rows).onConflictDoNothing(),
        ),
      );
    }
  }
}
