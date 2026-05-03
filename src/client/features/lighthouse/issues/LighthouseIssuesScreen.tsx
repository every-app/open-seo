import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  exportAuditLighthouseIssues,
  getAuditLighthouseIssues,
} from "@/serverFunctions/lighthouse";
import { exportTableToSheets } from "@/client/lib/exportToSheets";
import type { CategoryTab, ExportPayload, LighthouseIssue } from "./types";
import {
  categoryLabel,
  categorySlug,
  downloadTextFile,
  issuesToCsv,
  issuesToTable,
} from "./utils";
import {
  LighthouseIssueList,
  LighthouseIssuesHeader,
  LighthouseIssuesToolbar,
} from "./LighthouseIssuesParts";
import { categoryTabs } from "./types";

type LighthouseIssuesScreenProps = {
  projectId: string;
  resultId: string;
  category: CategoryTab;
  backLabel: string;
  onBack: () => void;
  onCategoryChange: (next: CategoryTab) => void;
};

export function LighthouseIssuesScreen(props: LighthouseIssuesScreenProps) {
  const { projectId, resultId, category, backLabel, onBack, onCategoryChange } =
    props;

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
    runExportCsv,
    runExportSheets,
    selectedCategoryLabel,
    severityCounts,
    visibleIssues,
  } = useLighthouseIssuesActions({
    category,
    exportMutation,
    allIssues: issuesQuery.data?.issues ?? [],
  });

  const issuesErrorMessage =
    issuesQuery.error instanceof Error
      ? issuesQuery.error.message
      : "Failed to load Lighthouse issues.";
  const showsLegacyPayloadNotice =
    issuesQuery.data != null && !issuesQuery.data.hasIssueDetails;
  const emptyMessage = showsLegacyPayloadNotice
    ? "This audit was saved without issue-level Lighthouse details. Re-run the audit to populate this screen."
    : undefined;

  return (
    <div className="px-4 py-3 md:px-6 md:py-4 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-5xl space-y-4">
        <LighthouseIssuesHeader
          backLabel={backLabel}
          onBack={onBack}
          scannedAt={issuesQuery.data?.createdAt}
          finalUrl={issuesQuery.data?.finalUrl}
          scores={issuesQuery.data?.scores}
          metrics={issuesQuery.data?.metrics}
          severityCounts={severityCounts}
        />

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            {issuesQuery.isError ? (
              <div className="alert alert-error">
                <AlertCircle className="size-4" />
                <span>{issuesErrorMessage}</span>
              </div>
            ) : null}

            {showsLegacyPayloadNotice ? (
              <div className="alert alert-warning">
                <TriangleAlert className="size-4" />
                <span>
                  This Lighthouse run was stored before issue details were
                  preserved. Re-run the audit to see category counts and issue
                  cards.
                </span>
              </div>
            ) : null}

            <LighthouseIssuesToolbar
              category={category}
              categoryCounts={categoryCounts}
              selectedCategoryLabel={selectedCategoryLabel}
              isBusy={exportMutation.isPending}
              visibleIssues={visibleIssues}
              allIssues={allIssues}
              onCategoryChange={onCategoryChange}
              onCopy={(data, message) => {
                void runCopy(data, message);
              }}
              onExport={(data) => {
                void runExport(data);
              }}
              onExportCsv={runExportCsv}
              onExportSheets={runExportSheets}
            />
            <LighthouseIssueList
              issues={visibleIssues}
              isLoading={issuesQuery.isLoading}
              emptyMessage={emptyMessage}
            />
          </div>
        </div>
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
      downloadTextFile(exported.filename, exported.content, "application/json");
      toast.success("Download started");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to export payload";
      toast.error(message);
    }
  };

  const runExportCsv = (
    rows: LighthouseIssue[],
    variant: "all" | "current",
  ) => {
    const filename = `lighthouse-${variant}-${categorySlug(category)}-issues.csv`;
    downloadTextFile(filename, issuesToCsv(rows), "text/csv");
    toast.success("CSV download started");
  };

  const runExportSheets = (
    rows: LighthouseIssue[],
    variant: "all" | "current",
  ) => {
    const table = issuesToTable(rows);
    void exportTableToSheets({
      headers: table.headers,
      rows: table.rows,
      feature: `lighthouse_issues_${variant}`,
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
    runExportCsv,
    runExportSheets,
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
