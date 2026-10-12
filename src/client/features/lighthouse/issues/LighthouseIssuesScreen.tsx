import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  exportAuditLighthouseIssues,
  getAuditLighthouseIssues,
} from "@/serverFunctions/lighthouse";
import { downloadFile } from "@/client/lib/download";
import { QueryError } from "@/client/components/QueryState";
import { TableCard } from "@/client/components/ui/table";
import { getErrorCode } from "@/client/lib/error-messages";
import { exportRows } from "@/client/lib/exportRows";
import type { CategoryTab, ExportPayload, LighthouseIssue } from "./types";
import { categoryLabel, issuesToTable } from "./utils";
import {
  LighthouseIssueList,
  LighthouseIssuesHeader,
  LighthouseIssuesToolbar,
} from "./LighthouseIssuesParts";
import { categoryTabs } from "./types";

export function LighthouseIssuesScreen({
  projectId,
  resultId,
  category,
  auditId,
}: {
  projectId: string;
  resultId: string;
  category: CategoryTab;
  auditId: string | undefined;
}) {
  const navigate = useNavigate({
    from: "/p/$projectId/audit/issues/$resultId",
  });

  const issuesQuery = useQuery({
    queryKey: ["auditLighthouseIssues", projectId, resultId],
    queryFn: () =>
      getAuditLighthouseIssues({
        data: {
          projectId,
          resultId,
        },
      }),
  });

  const exportMutation = useMutation({
    meta: { errorToast: false },
    mutationFn: (
      data: ExportPayload,
    ): Promise<{ filename: string; content: string }> =>
      exportAuditLighthouseIssues({
        data: {
          projectId,
          resultId,
          ...data,
        },
      }),
  });

  const {
    allIssues,
    categoryCounts,
    runCopy,
    runExport,
    runExportRows,
    selectedCategoryLabel,
    severityCounts,
    visibleIssues,
  } = useLighthouseIssuesActions({
    category,
    exportMutation,
    allIssues: issuesQuery.data?.issues ?? [],
  });

  // Runs stored before issue details were kept have no issues to list.
  const emptyMessage =
    issuesQuery.data != null && !issuesQuery.data.hasIssueDetails
      ? "This Lighthouse run was saved without issue details. Re-run the audit to see them."
      : undefined;

  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4">
        <LighthouseIssuesHeader
          onBack={() =>
            void navigate({
              to: "/p/$projectId/audit",
              params: { projectId },
              search: auditId ? { auditId } : undefined,
            })
          }
          isLoading={issuesQuery.isPending}
          scannedAt={issuesQuery.data?.createdAt}
          finalUrl={issuesQuery.data?.finalUrl}
          scores={issuesQuery.data?.scores}
          metrics={issuesQuery.data?.metrics}
          severityCounts={severityCounts}
        />

        <TableCard>
          {issuesQuery.isError ? (
            <div className="p-4">
              <QueryError
                error={issuesQuery.error}
                fallback="Failed to load Lighthouse issues."
                // A missing result stays missing, so retry cannot help.
                onRetry={
                  getErrorCode(issuesQuery.error) === "NOT_FOUND"
                    ? undefined
                    : () => void issuesQuery.refetch()
                }
                isRetrying={issuesQuery.isFetching}
              />
            </div>
          ) : null}

          <LighthouseIssuesToolbar
            category={category}
            categoryCounts={categoryCounts}
            selectedCategoryLabel={selectedCategoryLabel}
            isBusy={exportMutation.isPending}
            visibleIssues={visibleIssues}
            allIssues={allIssues}
            onCategoryChange={(next) =>
              void navigate({
                search: (prev) => ({ ...prev, category: next }),
                replace: true,
              })
            }
            onCopy={(data, message) => {
              void runCopy(data, message);
            }}
            onExport={(data) => {
              void runExport(data);
            }}
            onExportRows={runExportRows}
          />
          <LighthouseIssueList
            issues={visibleIssues}
            isLoading={issuesQuery.isLoading}
            emptyMessage={emptyMessage}
          />
        </TableCard>
      </div>
    </div>
  );
}

function useLighthouseIssuesActions({
  allIssues,
  category,
  exportMutation,
}: {
  allIssues: LighthouseIssue[];
  category: CategoryTab;
  exportMutation: {
    mutateAsync: (
      data: ExportPayload,
    ) => Promise<{ filename: string; content: string }>;
  };
}) {
  const visibleIssues =
    category === "all"
      ? allIssues
      : allIssues.filter((issue) => issue.category === category);
  const selectedCategoryLabel = categoryLabel(category);
  const categoryCounts = getCategoryCounts(allIssues);
  const severityCounts = getSeverityCounts(visibleIssues);

  const runExport = async (data: ExportPayload) => {
    try {
      const exported = await exportMutation.mutateAsync(data);
      downloadFile(exported.content, exported.filename, "application/json");
      toast.success("Download started");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to export payload";
      toast.error(message);
    }
  };

  const runExportRows = (
    format: "csv" | "sheets",
    rows: LighthouseIssue[],
    variant: "all" | "current",
  ) => {
    void exportRows({
      format,
      feature: `lighthouse_issues_${variant}`,
      ...issuesToTable(rows),
      filename: `lighthouse-${variant}-${category}-issues`,
    });
  };

  const runCopy = async (data: ExportPayload, toastMessage: string) => {
    try {
      const exported = await exportMutation.mutateAsync(data);
      await navigator.clipboard.writeText(exported.content);
      toast.success(toastMessage);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to copy payload";
      toast.error(message);
    }
  };

  return {
    allIssues,
    categoryCounts,
    runCopy,
    runExport,
    runExportRows,
    selectedCategoryLabel,
    severityCounts,
    visibleIssues,
  };
}

function getCategoryCounts(
  allIssues: LighthouseIssue[],
): Record<CategoryTab, number> {
  return categoryTabs.reduce<Record<CategoryTab, number>>(
    (acc, tab) => {
      if (tab === "all") {
        acc[tab] = allIssues.length;
        return acc;
      }
      acc[tab] = allIssues.filter((issue) => issue.category === tab).length;
      return acc;
    },
    {
      all: allIssues.length,
      performance: 0,
      accessibility: 0,
      "best-practices": 0,
      seo: 0,
    },
  );
}

function getSeverityCounts(issues: LighthouseIssue[]) {
  return {
    critical: issues.filter((issue) => issue.severity === "critical").length,
    warning: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };
}
