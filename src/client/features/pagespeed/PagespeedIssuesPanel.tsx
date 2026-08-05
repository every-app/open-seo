import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { LighthouseIssueList } from "@/client/features/lighthouse/issues/LighthouseIssuesParts";
import { getPagespeedIssues } from "@/serverFunctions/pagespeed";
import {
  LIGHTHOUSE_CATEGORY_TABS,
  type LighthouseCategoryTab,
} from "@/shared/lighthouse";

const TAB_LABEL: Record<LighthouseCategoryTab, string> = {
  all: "All",
  performance: "Performance",
  accessibility: "Accessibility",
  "best-practices": "Best practices",
  seo: "SEO",
};

/**
 * The Lighthouse opportunities behind a run's scores — what to actually fix.
 *
 * Renders with the audit feature's `LighthouseIssueList`: PSI issues come from
 * the same extraction, so they are structurally identical and no changes to the
 * audit code were needed.
 */
export function PagespeedIssuesPanel({
  projectId,
  snapshotId,
}: {
  projectId: string;
  snapshotId: string;
}) {
  const [tab, setTab] = React.useState<LighthouseCategoryTab>("all");
  const issuesQuery = useQuery({
    queryKey: ["pagespeedIssues", projectId, snapshotId],
    queryFn: () => getPagespeedIssues({ data: { projectId, snapshotId } }),
  });
  const data = issuesQuery.data;

  const issues = React.useMemo(() => {
    if (!data?.available) return [];
    return tab === "all"
      ? data.payload.issues
      : data.payload.issues.filter((issue) => issue.category === tab);
  }, [data, tab]);

  return (
    <section className="rounded-xl border border-base-300 bg-base-100 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 p-4">
        <h2 className="text-sm font-semibold">What to fix</h2>
        {data?.available ? (
          <div className="join">
            {LIGHTHOUSE_CATEGORY_TABS.map((value) => (
              <button
                key={value}
                type="button"
                className={`btn join-item btn-xs ${
                  tab === value ? "btn-active" : ""
                }`}
                onClick={() => setTab(value)}
              >
                {TAB_LABEL[value]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="p-4">
        {issuesQuery.isError ? (
          <p className="text-sm text-error">Couldn't load the issue detail.</p>
        ) : data && !data.available ? (
          <p className="text-sm text-base-content/60">
            No issue detail stored for this run — it predates detail capture, or
            the upload failed. Run this URL again to collect it.
          </p>
        ) : (
          <LighthouseIssueList
            issues={issues}
            isLoading={issuesQuery.isLoading}
            emptyMessage={
              tab === "all"
                ? "No actionable issues found. Nothing to fix here."
                : `No actionable ${TAB_LABEL[tab].toLowerCase()} issues.`
            }
          />
        )}
      </div>
    </section>
  );
}
