import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Diff } from "lucide-react";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { EmptyState } from "@/client/components/EmptyState";
import { Spinner } from "@/client/components/Spinner";
import { Alert, AlertTitle } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { CompareActionables } from "@/client/features/audit/compare/CompareActionables";
import { CompareKpiStrip } from "@/client/features/audit/compare/CompareKpiStrip";
import { formatDate } from "@/client/features/audit/shared";
import { compareLatestAudits } from "@/serverFunctions/audit-compare";

export function CompareView({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: ["audit-compare-latest", projectId],
    queryFn: () => compareLatestAudits({ data: { projectId } }),
  });

  if (query.isPending) {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Comparing audits…" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load the audit comparison. Try again.</AlertTitle>
      </Alert>
    );
  }

  const data = query.data;
  if (!data) return null;

  if (!data.ok) {
    return (
      <div className="space-y-4">
        <PageHeader
          backLink={
            <BackLink to="/p/$projectId/audit" params={{ projectId }}>
              Site Audit
            </BackLink>
          }
          title="Compare latest audits"
        />
        <EmptyState
          icon={Diff}
          title="Need two completed audits"
          description={`Comparison uses the two most recent completed crawls. You currently have ${data.completedCount}. Run another audit to unlock this view.`}
          action={
            <Button
              nativeButton={false}
              render={
                <Link to="/p/$projectId/audit" params={{ projectId }} />
              }
            >
              Back to Site Audit
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        backLink={
          <BackLink to="/p/$projectId/audit" params={{ projectId }}>
            Site Audit
          </BackLink>
        }
        title="Compare latest audits"
        description={`Previous (${formatDate(data.previous.startedAt)}) → Latest (${formatDate(data.latest.startedAt)})`}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <Link
                  to="/p/$projectId/audit"
                  params={{ projectId }}
                  search={{ auditId: data.previous.id, tab: "issues" }}
                />
              }
            >
              View previous
            </Button>
            <Button
              size="sm"
              nativeButton={false}
              render={
                <Link
                  to="/p/$projectId/audit"
                  params={{ projectId }}
                  search={{ auditId: data.latest.id, tab: "issues" }}
                />
              }
            >
              View latest
            </Button>
          </>
        }
      />

      <CompareKpiStrip
        previous={data.previousKpis}
        latest={data.latestKpis}
        hasLighthouse={
          data.previousKpis.lighthouseTests > 0 ||
          data.latestKpis.lighthouseTests > 0
        }
      />

      <div className="flex flex-wrap gap-2">
        <Badge variant="destructive" className="gap-1.5">
          <span className="font-semibold tabular-nums">
            {data.summary.newCount}
          </span>
          New
        </Badge>
        <Badge variant="warning" className="gap-1.5">
          <span className="font-semibold tabular-nums">
            {data.summary.persistentCount}
          </span>
          Persistent
        </Badge>
        <Badge variant="success" className="gap-1.5">
          <span className="font-semibold tabular-nums">
            {data.summary.resolvedCount}
          </span>
          Resolved
        </Badge>
      </div>

      <CompareActionables groups={data.issueGroups} />
    </div>
  );
}
