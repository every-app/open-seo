/**
 * Row shape and ordering for `get_pagespeed_issues`.
 *
 * Split from the tool module so the ordering — which decides what survives a
 * truncated list — can be tested directly rather than through a tool call.
 */
import type { McpTableColumn } from "@/server/mcp/table";

/** One Lighthouse issue, flattened for the table and structured payload. */
export type PagespeedIssueRow = {
  url: string;
  category: string;
  severity: string;
  issue: string;
  detail: string;
  /** The audit's own rows — the offending line, URL or node. `displayValue`
   *  only counts them ("1 error found"), which is not actionable. */
  evidence: string[];
  impactMs: number | null;
  impactBytes: number | null;
  auditKey: string;
};

export const ISSUE_COLUMNS: McpTableColumn<PagespeedIssueRow>[] = [
  { header: "url", value: (row) => row.url },
  { header: "category", value: (row) => row.category },
  { header: "severity", value: (row) => row.severity },
  { header: "issue", value: (row) => row.issue },
  { header: "evidence", value: (row) => row.evidence.join(" | ") || "—" },
  { header: "detail", value: (row) => row.detail },
  { header: "audit", value: (row) => row.auditKey },
];

/** Worst first, so a truncated list still leads with what matters. */
const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Bytes are weighed against milliseconds at 1 KB ≈ 1 ms so a single number
 *  can order opportunities that report only one of the two. */
function measuredImpact(row: PagespeedIssueRow): number {
  return (row.impactMs ?? 0) + (row.impactBytes ?? 0) / 1000;
}

/** Severity first, then measured impact, so the biggest win leads its band. */
export function byWorstFirst(
  a: PagespeedIssueRow,
  b: PagespeedIssueRow,
): number {
  const bySeverity =
    (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3);
  if (bySeverity !== 0) return bySeverity;
  return measuredImpact(b) - measuredImpact(a);
}
