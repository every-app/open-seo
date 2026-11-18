import type {
  getAuditIssues,
  getAuditPages,
  getAuditSummary,
} from "@/serverFunctions/audit";

export type AuditResultsData = Awaited<ReturnType<typeof getAuditSummary>>;
export type AuditPageRow = Awaited<
  ReturnType<typeof getAuditPages>
>["rows"][number];
export type AuditIssueRow = Awaited<ReturnType<typeof getAuditIssues>>[number];
export type AuditLighthouseRow = AuditResultsData["lighthouse"][number];
