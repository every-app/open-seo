import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { exportPsiBySource, getPsiIssuesBySource } from "@/serverFunctions/psi";
import type { CategoryTab, ExportPayload, PsiIssue } from "./types";
import {
  categoryLabel,
  categorySlug,
  downloadTextFile,
  issuesToCsv,
} from "./utils";
import {
  PsiIssueList,
  PsiIssuesHeader,
  PsiIssuesToolbar,
} from "./PsiIssuesParts";
import { categoryTabs } from "./types";

type PsiIssuesScreenProps = {
  projectId: string;
  resultId: string;
  source: string;
  category: CategoryTab;
  backLabel: string;
  onBack: () => void;
  onCategoryChange: (next: CategoryTab) => void;
};

export function PsiIssuesScreen(props: PsiIssuesScreenProps) {
  const {
    projectId,
    resultId,
    source,
    category,
    backLabel,
    onBack,
    onCategoryChange,
  } = props;

  const issuesQuery = useQuery({
    queryKey: ["psiIssuesBySource", projectId, source, resultId, category],
    queryFn: () =>
      getPsiIssuesBySource({
        data: {
          projectId,
          source,
          resultId,
          category: category === "all" ? undefined : category,
        },
      }),
  });

  const summaryQuery = useQuery({
    queryKey: ["psiIssuesSummary", projectId, source, resultId],
    queryFn: () =>
      getPsiIssuesBySource({
        data: {
          projectId,
          source,
          resultId,
        },
      }),
  });

  const exportMutation = useMutation({
    mutationFn: (data: ExportPayload) =>
      exportPsiBySource({
        data: {
          projectId,
          source,
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
    selectedCategoryLabel,
    severityCounts,
    visibleIssues,
  } = usePsiIssuesActions({
    category,
    exportMutation,
    issues: (issuesQuery.data?.issues ?? []) as PsiIssue[],
    summaryIssues: summaryQuery.data?.issues,
  });

  return (
    <div className="px-4 py-3 md:px-6 md:py-4 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-5xl space-y-4">
        <PsiIssuesHeader
          backLabel={backLabel}
          onBack={onBack}
          scannedAt={issuesQuery.data?.createdAt}
          finalUrl={issuesQuery.data?.finalUrl}
          severityCounts={severityCounts}
        />

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            <PsiIssuesToolbar
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
            />
            <PsiIssueList
              issues={visibleIssues}
              isLoading={issuesQuery.isLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function usePsiIssuesActions({
  category,
  exportMutation,
  issues,
  summaryIssues,
}: {
  category: CategoryTab;
  exportMutation: {
    mutateAsync: (
      data: ExportPayload,
    ) => Promise<{ filename: string; content: string }>;
  };
  issues: PsiIssue[];
  summaryIssues: PsiIssue[] | undefined;
}) {
  const visibleIssues = issues;
  const allIssues = summaryIssues ?? visibleIssues;
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

  const runExportCsv = (rows: PsiIssue[], variant: "all" | "current") => {
    const filename = `psi-${variant}-${categorySlug(category)}-issues.csv`;
    downloadTextFile(filename, issuesToCsv(rows), "text/csv");
    toast.success("CSV download started");
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
    selectedCategoryLabel,
    severityCounts,
    visibleIssues,
  };
}

function getCategoryCounts(allIssues: PsiIssue[]): Record<CategoryTab, number> {
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

function getSeverityCounts(issues: PsiIssue[]) {
  return {
    critical: issues.filter((issue) => issue.severity === "critical").length,
    warning: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };
}
