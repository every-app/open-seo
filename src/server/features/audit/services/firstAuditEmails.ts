import { sort } from "remeda";
import { sendLoopsEvent } from "@/server/email/loops-client";
import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import {
  getAuditsCompletedSince,
  getIssueTypePageCountsForAudit,
  hasCompletedAuditBefore,
} from "@/server/features/audit/repositories/auditSummaryQueries";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  getIssueDescriptor,
  ISSUE_SEVERITY_ORDER,
} from "@/shared/audit-issues";

// Audits finish on the audit worker, which deliberately holds no Loops key,
// so the app worker's 5-minute cron picks up newly finished audits instead.
// The lookback spans several ticks so one failed tick loses no email; the
// per-audit idempotency key (Loops dedupes for 24 hours) stops repeats.
const FIRST_AUDIT_LOOKBACK_MS = 30 * 60_000;

/** Emails each user the results of the first audit they complete. Most
 *  start it by adding their website during onboarding. When the crawler was
 *  blocked on most pages the email is a different one: how to let it in. */
export async function sendFirstAuditEmails() {
  const apiKey = await getOptionalEnvValue("LOOPS_API_KEY");
  const baseUrl = await getOptionalEnvValue("BETTER_AUTH_URL");
  if (!apiKey || !baseUrl) return;

  const since = new Date(Date.now() - FIRST_AUDIT_LOOKBACK_MS).toISOString();
  for (const audit of await getAuditsCompletedSince(since)) {
    try {
      if (
        !audit.completedAt ||
        (await hasCompletedAuditBefore(audit.userId, audit.completedAt))
      ) {
        continue;
      }

      const blockedPages = await AuditRepository.countPagesByFetchClass(
        audit.id,
        "blocked",
      );
      const issues = sort(
        (await getIssueTypePageCountsForAudit(audit.id)).map((row) => ({
          ...row,
          title: getIssueDescriptor(row.issueType)?.title ?? row.issueType,
        })),
        (a, b) =>
          ISSUE_SEVERITY_ORDER[a.severity] - ISSUE_SEVERITY_ORDER[b.severity] ||
          b.pages - a.pages,
      );
      const countFor = (severity: string) =>
        issues
          .filter((issue) => issue.severity === severity)
          .reduce((total, issue) => total + issue.pages, 0);

      await sendLoopsEvent({
        apiKey,
        idempotencyKey: `first_audit:${audit.id}`,
        payload: {
          email: audit.email,
          userId: audit.userId,
          eventName:
            blockedPages * 2 >= audit.pagesCrawled
              ? "first_audit_blocked"
              : "first_audit_completed",
          eventProperties: {
            domain: new URL(audit.startUrl).hostname,
            pagesCrawled: audit.pagesCrawled,
            criticalIssues: countFor("critical"),
            warningIssues: countFor("warning"),
            infoIssues: countFor("info"),
            topIssue1: issues[0]?.title ?? "",
            topIssue2: issues[1]?.title ?? "",
            topIssue3: issues[2]?.title ?? "",
            auditUrl: new URL(
              `/p/${audit.projectId}/audit?auditId=${audit.id}`,
              baseUrl,
            ).href,
          },
        },
        logContext: { action: "first-audit-email", auditId: audit.id },
      });
    } catch (error) {
      // One bad audit must not stop the sweep.
      console.error("onboarding drip: first audit email failed", {
        auditId: audit.id,
        error,
      });
    }
  }
}
