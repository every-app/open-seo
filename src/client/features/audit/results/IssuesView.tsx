import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { sort } from "remeda";
import {
  getIssueDescriptor,
  ISSUE_SEVERITY_ORDER,
  type IssueSeverity,
} from "@/shared/audit-issues";
import type { AuditResultsData } from "@/client/features/audit/results/types";
import { SeverityBadge } from "@/client/features/audit/shared";
import { EmptyState } from "@/client/components/EmptyState";
import { QueryState } from "@/client/components/QueryState";
import { Skeleton } from "@/client/components/ui/skeleton";
import { getAuditIssues } from "@/serverFunctions/audit";

type IssueGroupSummary = AuditResultsData["issueGroups"][number];
type AuditRef = { projectId: string; auditId: string };

const MAX_RENDERED_URLS = 100;

const SEVERITY_RULE: Record<IssueSeverity, string> = {
  critical: "border-l-destructive/60",
  warning: "border-l-warning/60",
  info: "border-l-info/60",
};

const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

interface IssueGroup {
  issueType: string;
  severity: IssueSeverity;
  title: string;
  explanation: string;
  howToFix: string;
  count: number;
}

export function resolveIssueSeverity(issue: {
  issueType: string;
  severity: string;
}): IssueSeverity {
  const descriptor = getIssueDescriptor(issue.issueType);
  if (descriptor) return descriptor.severity;
  return issue.severity === "critical" || issue.severity === "warning"
    ? issue.severity
    : "info";
}

function toIssueGroups(summaries: IssueGroupSummary[]): IssueGroup[] {
  const groups = summaries.map((summary) => {
    const descriptor = getIssueDescriptor(summary.issueType);
    return {
      issueType: summary.issueType,
      severity: resolveIssueSeverity(summary),
      title: descriptor?.title ?? summary.issueType,
      explanation: descriptor?.explanation ?? "",
      howToFix: descriptor?.howToFix ?? "",
      count: summary.count,
    };
  });

  return sort(
    groups,
    (a, b) =>
      ISSUE_SEVERITY_ORDER[a.severity] - ISSUE_SEVERITY_ORDER[b.severity] ||
      b.count - a.count,
  );
}

export function IssuesView({
  auditRef,
  issueGroups,
  tabs,
}: {
  auditRef: AuditRef;
  issueGroups: IssueGroupSummary[];
  tabs: ReactNode;
}) {
  const groups = useMemo(() => toIssueGroups(issueGroups), [issueGroups]);

  const sections = useMemo(
    () =>
      (["critical", "warning", "info"] as const)
        .map((severity) => ({
          severity,
          groups: groups.filter((group) => group.severity === severity),
        }))
        .filter((section) => section.groups.length > 0),
    [groups],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {tabs}
      {groups.length === 0 ? (
        <EmptyState
          variant="plain"
          title="No issues found."
          description="Every crawled page passed the issue checks."
        />
      ) : (
        <div>
          {sections.map((section) => (
            <IssueSection
              key={section.severity}
              auditRef={auditRef}
              section={section}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IssueSection({
  auditRef,
  section,
}: {
  auditRef: AuditRef;
  section: { severity: IssueSeverity; groups: IssueGroup[] };
}) {
  const issueCount = section.groups.reduce(
    (sum, group) => sum + group.count,
    0,
  );

  return (
    <div className="border-t border-border first:border-t-0">
      <div className="flex items-center gap-2 bg-muted/50 px-4 py-1.5 border-b border-border">
        <SeverityBadge severity={section.severity}>
          {SEVERITY_LABEL[section.severity]}
          <span className="tabular-nums">{issueCount}</span>
        </SeverityBadge>
      </div>
      <div className="divide-y divide-border">
        {section.groups.map((group) => (
          <IssueRow key={group.issueType} auditRef={auditRef} group={group} />
        ))}
      </div>
    </div>
  );
}

function IssueRow({
  auditRef,
  group,
}: {
  auditRef: AuditRef;
  group: IssueGroup;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={
        open
          ? `border-l-2 ${SEVERITY_RULE[group.severity]} bg-muted/30`
          : "border-l-2 border-l-transparent"
      }
    >
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="text-sm font-medium flex-1 min-w-0 truncate">
          {group.title}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground shrink-0">
          {group.count} {group.count === 1 ? "page" : "pages"}
        </span>
        <ChevronRight
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-90" : ""
          }`}
        />
      </button>

      {open && (
        <div className="pl-4 pr-4 pb-4 pt-0.5 space-y-3">
          {group.explanation && (
            <p className="text-sm text-muted-foreground max-w-prose">
              {group.explanation}
            </p>
          )}
          {group.howToFix && (
            <p className="text-sm max-w-prose">
              <span className="font-medium">How to fix: </span>
              <span className="text-foreground/80">{group.howToFix}</span>
            </p>
          )}
          <AffectedUrlList auditRef={auditRef} group={group} />
        </div>
      )}
    </div>
  );
}

/** Loads the group's first URLs only when it is opened. */
function AffectedUrlList({
  auditRef,
  group,
}: {
  auditRef: AuditRef;
  group: IssueGroup;
}) {
  const query = useQuery({
    queryKey: ["audit-issues", auditRef, group.issueType],
    queryFn: () =>
      getAuditIssues({
        data: {
          ...auditRef,
          issueType: group.issueType,
          pageSize: MAX_RENDERED_URLS,
        },
      }),
  });
  const remaining = group.count - MAX_RENDERED_URLS;

  return (
    <div className="max-h-[320px] overflow-y-auto rounded border border-border bg-card">
      <QueryState
        query={query}
        loading={
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        }
        errorFallback="Could not load the affected URLs"
      >
        {(issues) => (
          <>
            {issues.map((issue) => (
              <div
                key={issue.id}
                className="px-3 py-1.5 text-sm flex flex-col gap-0.5 border-b border-border last:border-b-0"
              >
                <a
                  className="text-foreground/80 truncate hover:underline"
                  href={issue.pageUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={issue.pageUrl}
                >
                  {issue.pageUrl}
                </a>
                <IssueDetails detailsJson={issue.detailsJson} />
              </div>
            ))}
            {remaining > 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                …and {remaining} more — export the issues CSV for the full list.
              </div>
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}

// AuditRepository is the only writer and always stores JSON.stringify of a
// details object, so the parse cannot throw.
function parseDetails(detailsJson: string): Array<[string, unknown]> | null {
  const parsed: unknown = JSON.parse(detailsJson);
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    return Object.entries(parsed);
  }
  return null;
}

function IssueDetails({ detailsJson }: { detailsJson: string | null }) {
  const details = useMemo(
    () => (detailsJson ? parseDetails(detailsJson) : null),
    [detailsJson],
  );

  if (!details) return null;

  const entries = details.filter(
    ([, value]) => value !== null && value !== undefined,
  );
  if (entries.length === 0) return null;

  return (
    <span className="text-xs text-muted-foreground truncate">
      {entries
        .map(([key, value]) => {
          const rendered = Array.isArray(value)
            ? value.join(" → ")
            : String(value);
          return `${key}: ${rendered}`;
        })
        .join(" · ")}
    </span>
  );
}
