import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { EmptyState } from "@/client/components/EmptyState";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { SectionHeader } from "@/client/components/PageHeader";
import { Badge } from "@/client/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/client/components/ui/collapsible";
import type {
  CompareIssueChange,
  CompareIssueGroup,
} from "@/server/features/audit/services/AuditCompareService";
import type { IssueSeverity } from "@/shared/audit-issues";

const MAX_URLS = 50;

const CHANGE_SECTIONS: Array<{
  change: CompareIssueChange;
  title: string;
  empty: string;
}> = [
  {
    change: "new",
    title: "New issues",
    empty: "No new issues versus the previous audit.",
  },
  {
    change: "persistent",
    title: "Still open",
    empty: "No recurring issues across both audits.",
  },
  {
    change: "resolved",
    title: "Resolved",
    empty: "No issues were resolved between these audits.",
  },
];

const SEVERITY_DOT: Record<IssueSeverity, string> = {
  critical: "bg-destructive",
  warning: "bg-warning",
  info: "bg-muted-foreground/40",
};

const SEVERITY_BADGE: Record<
  IssueSeverity,
  "destructive" | "warning" | "secondary"
> = {
  critical: "destructive",
  warning: "warning",
  info: "secondary",
};

const SEVERITY_LABEL: Record<IssueSeverity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

export function CompareActionables({
  groups,
}: {
  groups: CompareIssueGroup[];
}) {
  const sections = useMemo(
    () =>
      CHANGE_SECTIONS.map((section) => ({
        ...section,
        groups: groups.filter((group) => group.change === section.change),
      })),
    [groups],
  );

  if (groups.length === 0) {
    return (
      <EmptyState
        title="No issues in either audit"
        description="Both crawls came back clean — nothing to action."
        variant="card"
      />
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <section key={section.change} className="space-y-2">
          <SectionHeader
            title={`${section.title} (${section.groups.length})`}
          />
          {section.groups.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">{section.empty}</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="divide-y divide-border">
                {section.groups.map((group) => (
                  <IssueGroupRow
                    key={`${group.change}-${group.issueType}`}
                    group={group}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function IssueGroupRow({ group }: { group: CompareIssueGroup }) {
  const [open, setOpen] = useState(false);
  const urls = group.urls.slice(0, MAX_URLS);
  const overflow = group.urls.length - urls.length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="px-4 py-3">
        <CollapsibleTrigger className="group flex w-full items-start gap-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-90" />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`size-2 rounded-full ${SEVERITY_DOT[group.severity]}`}
              />
              <span className="font-medium">{group.title}</span>
              <Badge variant={SEVERITY_BADGE[group.severity]} size="sm">
                {SEVERITY_LABEL[group.severity]}
              </Badge>
              <span className="text-xs text-muted-foreground tabular-nums">
                {group.previousCount} → {group.latestCount}
                {group.delta !== 0 ? (
                  <span
                    className={
                      group.delta < 0
                        ? "ml-1 text-success"
                        : "ml-1 text-destructive"
                    }
                  >
                    ({group.delta > 0 ? "+" : ""}
                    {group.delta})
                  </span>
                ) : null}
              </span>
            </div>
            {group.explanation ? (
              <p className="text-sm text-muted-foreground">{group.explanation}</p>
            ) : null}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-3 ml-7 space-y-3">
            {group.howToFix ? (
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <p className="mb-1 font-medium">How to fix</p>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {group.howToFix}
                </p>
              </div>
            ) : null}
            {urls.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {urls.map((url) => (
                  <li key={url} className="truncate">
                    <SafeExternalLink
                      url={url}
                      label={url}
                      className="inline-flex max-w-full items-center gap-1 truncate text-foreground underline-offset-4 hover:underline"
                    />
                  </li>
                ))}
                {overflow > 0 ? (
                  <li className="text-muted-foreground">
                    +{overflow} more URL{overflow === 1 ? "" : "s"}
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
