import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileWarning,
  Info,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { exportPsiBySource, getPsiIssuesBySource } from "@/serverFunctions/psi";
import { psiIssuesSearchSchema } from "@/types/schemas/psi";

const categoryTabs = [
  "all",
  "performance",
  "accessibility",
  "best-practices",
  "seo",
] as const;

type CategoryTab = (typeof categoryTabs)[number];
type IssueCategory = Exclude<CategoryTab, "all">;

type ExportPayload = {
  mode: "full" | "issues" | "category";
  category?: IssueCategory;
};

type PsiIssue = {
  auditKey: string;
  category: IssueCategory;
  severity: "critical" | "warning" | "info";
  score?: number | null;
  title: string;
  displayValue?: string | null;
  description?: string | null;
  impactMs?: number | null;
  impactBytes?: number | null;
  items: string[];
};

export const Route = createFileRoute("/p/$projectId/psi/issues/$resultId")({
  validateSearch: psiIssuesSearchSchema,
  component: PsiIssuesPage,
});

function PsiIssuesPage() {
  const { projectId, resultId } = Route.useParams();
  const { source, category } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

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

  const visibleIssues = (issuesQuery.data?.issues ?? []) as PsiIssue[];
  const allIssues = summaryQuery.data?.issues ?? visibleIssues;

  const categoryCounts = categoryTabs.reduce<Record<CategoryTab, number>>(
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

  const severityCounts = {
    critical: visibleIssues.filter((issue) => issue.severity === "critical")
      .length,
    warning: visibleIssues.filter((issue) => issue.severity === "warning")
      .length,
    info: visibleIssues.filter((issue) => issue.severity === "info").length,
  };

  const exportCurrentCategory: ExportPayload =
    category === "all"
      ? { mode: "issues" }
      : {
          mode: "category",
          category,
        };

  const selectedCategoryLabel = categoryLabel(category);

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

  const runExportCsv = (issues: PsiIssue[], variant: "all" | "current") => {
    const filename = `psi-${variant}-${categorySlug(category)}-issues.csv`;
    downloadTextFile(filename, issuesToCsv(issues), "text/csv");
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

  const isBusy = exportMutation.isPending;

  return (
    <div className="px-4 py-3 md:px-6 md:py-4 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <button
            className="btn btn-ghost btn-sm px-2"
            onClick={() =>
              navigate({
                to: source === "site" ? "/p/$projectId/audit" : "..",
                params: { projectId },
              })
            }
          >
            &larr; Back to {source === "site" ? "Site Audit" : "PSI"}
          </button>
          <span className="text-xs text-base-content/60">
            {issuesQuery.data?.createdAt
              ? `Scanned ${new Date(issuesQuery.data.createdAt).toLocaleString()}`
              : "Reading latest issues..."}
          </span>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body py-5 gap-4">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold">PSI Issues</h1>
              <p className="text-sm text-base-content/70 break-all">
                {issuesQuery.data?.finalUrl ?? "Loading URL..."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="badge border border-error/30 bg-error/10 text-error/80 gap-1">
                <FileWarning className="size-3" />
                Critical {severityCounts.critical}
              </span>
              <span className="badge border border-warning/30 bg-warning/10 text-warning/80 gap-1">
                <TriangleAlert className="size-3" />
                Warning {severityCounts.warning}
              </span>
              <span className="badge border border-info/30 bg-info/10 text-info/80 gap-1">
                <Info className="size-3" />
                Info {severityCounts.info}
              </span>
            </div>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            <div className="sticky top-0 z-[2] -mx-2 px-2 py-2 bg-base-100/95 backdrop-blur-sm border-b border-base-300/60">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-4">
                  {categoryTabs.map((tab) => (
                    <button
                      key={tab}
                      className={`pb-2 border-b-2 text-sm font-medium transition-colors ${
                        category === tab
                          ? "border-primary text-base-content"
                          : "border-transparent text-base-content/60 hover:text-base-content"
                      }`}
                      onClick={() =>
                        navigate({
                          search: (prev) => ({
                            ...prev,
                            category: tab,
                          }),
                          replace: true,
                        })
                      }
                    >
                      <span>{categoryLabel(tab)}</span>
                      <span className="ml-1 text-xs opacity-70">
                        ({categoryCounts[tab]})
                      </span>
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <div className="dropdown dropdown-end">
                    <div
                      tabIndex={0}
                      role="button"
                      className="btn btn-sm gap-1"
                    >
                      <Download className="size-4" />
                      Export
                      <ChevronDown className="size-3 opacity-60" />
                    </div>
                    <ul
                      tabIndex={0}
                      className="dropdown-content z-10 menu p-2 shadow-lg bg-base-100 border border-base-300 rounded-box w-72"
                    >
                      <li className="menu-title">
                        <span>Copy</span>
                      </li>
                      <li>
                        <button
                          disabled={isBusy}
                          onClick={() =>
                            runCopy(
                              exportCurrentCategory,
                              `Copied ${selectedCategoryLabel.toLowerCase()} issues`,
                            )
                          }
                        >
                          <Copy className="size-4" />
                          Copy {selectedCategoryLabel.toLowerCase()} issues
                        </button>
                      </li>
                      <li>
                        <button
                          disabled={isBusy}
                          onClick={() =>
                            runCopy({ mode: "issues" }, "Copied all issues")
                          }
                        >
                          <Copy className="size-4" />
                          Copy all issues
                        </button>
                      </li>
                      <li>
                        <button
                          disabled={isBusy}
                          onClick={() =>
                            runCopy(
                              { mode: "full" },
                              "Copied full Lighthouse report",
                            )
                          }
                        >
                          <Copy className="size-4" />
                          Copy full Lighthouse report
                        </button>
                      </li>
                      <li className="menu-title">
                        <span>Download JSON</span>
                      </li>
                      <li>
                        <button
                          disabled={isBusy}
                          onClick={() => runExport(exportCurrentCategory)}
                        >
                          Download {selectedCategoryLabel.toLowerCase()} issues
                        </button>
                      </li>
                      <li>
                        <button
                          disabled={isBusy}
                          onClick={() => runExport({ mode: "issues" })}
                        >
                          Download all issues
                        </button>
                      </li>
                      <li>
                        <button
                          disabled={isBusy}
                          onClick={() => runExport({ mode: "full" })}
                        >
                          Download full Lighthouse report
                        </button>
                      </li>
                      <li className="menu-title">
                        <span>Download CSV</span>
                      </li>
                      <li>
                        <button
                          disabled={!visibleIssues.length}
                          onClick={() => runExportCsv(visibleIssues, "current")}
                        >
                          Download {selectedCategoryLabel.toLowerCase()} issues
                        </button>
                      </li>
                      <li>
                        <button
                          disabled={!allIssues.length}
                          onClick={() => runExportCsv(allIssues, "all")}
                        >
                          Download all issues
                        </button>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {issuesQuery.isLoading ? (
              <p className="text-sm text-base-content/60">Loading issues...</p>
            ) : visibleIssues.length ? (
              <div className="space-y-3">
                {visibleIssues.map((issue) => (
                  <div
                    key={`${issue.category}-${issue.auditKey}`}
                    className="card bg-base-200/30 border border-base-300"
                  >
                    <div className="card-body p-5 gap-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="badge badge-outline">
                            {issue.category}
                          </span>
                          <span
                            className={`badge border ${severityBadgeClass(issue.severity)} gap-1`}
                          >
                            {severityIcon(issue.severity)}
                            {issue.severity}
                          </span>
                          {issue.score != null && (
                            <div
                              className="tooltip tooltip-top"
                              data-tip="Lighthouse score from 0-100 for this audit. Lower means larger opportunity for improvement."
                            >
                              <span className="badge badge-ghost cursor-help">
                                Score {issue.score}
                              </span>
                            </div>
                          )}
                        </div>
                        {(issue.impactMs != null ||
                          issue.impactBytes != null) && (
                          <span className="text-xs text-base-content/60">
                            Impact {issue.impactMs ?? 0}ms /{" "}
                            {issue.impactBytes ?? 0} bytes
                          </span>
                        )}
                      </div>

                      <p className="font-semibold leading-tight">
                        {issue.title}
                      </p>

                      {issue.displayValue && (
                        <p className="text-sm text-base-content/70">
                          {issue.displayValue}
                        </p>
                      )}

                      {issue.description && (
                        <div className="text-sm text-base-content/80 leading-relaxed">
                          {renderInlineMarkdown(issue.description)}
                        </div>
                      )}

                      {issue.items.length > 0 && (
                        <details className="text-sm bg-base-100 rounded-box border border-base-300/80 px-3 py-2">
                          <summary className="cursor-pointer font-medium text-base-content/75">
                            Affected items ({issue.items.length})
                          </summary>
                          <div className="mt-2 space-y-2">
                            {issue.items.map((item) => (
                              <pre
                                key={`${issue.auditKey}-${item}`}
                                className="bg-base-200/60 p-2 rounded-box overflow-x-auto text-xs"
                              >
                                {item}
                              </pre>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-base-content/60">
                No unresolved issues for this category.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function categoryLabel(category: CategoryTab) {
  if (category === "best-practices") return "Best practices";
  if (category === "all") return "All";
  return `${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

function categorySlug(category: CategoryTab) {
  return category === "all" ? "all" : category;
}

function issuesToCsv(issues: PsiIssue[]) {
  const headers = [
    "Category",
    "Severity",
    "Score",
    "Title",
    "Display Value",
    "Description",
    "Impact (ms)",
    "Impact (bytes)",
    "Affected Items",
  ];

  const rows = issues.map((issue) => [
    issue.category,
    issue.severity,
    issue.score ?? "",
    issue.title,
    issue.displayValue ?? "",
    issue.description ?? "",
    issue.impactMs ?? "",
    issue.impactBytes ?? "",
    issue.items.length,
  ]);

  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ].join("\n");
}

function csvEscape(value: string | number) {
  const text = String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function renderInlineMarkdown(markdown: string): ReactNode {
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match = linkPattern.exec(markdown);

  while (match) {
    const [raw, label, href] = match;
    const index = match.index;

    if (index > cursor) {
      nodes.push(markdown.slice(cursor, index));
    }

    nodes.push(
      <a
        key={`${href}-${index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="link link-primary inline-flex items-center gap-1"
      >
        {label}
        <ExternalLink className="size-3" />
      </a>,
    );

    cursor = index + raw.length;
    match = linkPattern.exec(markdown);
  }

  if (cursor < markdown.length) {
    nodes.push(markdown.slice(cursor));
  }

  if (!nodes.length) {
    return markdown;
  }

  return nodes;
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function severityBadgeClass(severity: "critical" | "warning" | "info") {
  if (severity === "critical")
    return "border-error/30 bg-error/10 text-error/80";
  if (severity === "warning")
    return "border-warning/35 bg-warning/10 text-warning/80";
  return "border-info/30 bg-info/10 text-info/80";
}

function severityIcon(severity: "critical" | "warning" | "info") {
  if (severity === "critical") return <FileWarning className="size-3" />;
  if (severity === "warning") return <TriangleAlert className="size-3" />;
  return <Info className="size-3" />;
}
