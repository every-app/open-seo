import {
  ChevronDown,
  Copy,
  Download,
  FileWarning,
  Info,
  TriangleAlert,
} from "lucide-react";
import type { CategoryTab, ExportPayload, PsiIssue } from "./types";
import {
  categoryLabel,
  renderInlineMarkdown,
  severityBadgeClass,
  severityIcon,
} from "./utils";
import { categoryTabs } from "./types";

export function PsiIssuesHeader({
  backLabel,
  onBack,
  scannedAt,
  finalUrl,
  severityCounts,
}: {
  backLabel: string;
  onBack: () => void;
  scannedAt?: string;
  finalUrl?: string;
  severityCounts: { critical: number; warning: number; info: number };
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <button className="btn btn-ghost btn-sm px-2" onClick={onBack}>
          &larr; Back to {backLabel}
        </button>
        <span className="text-xs text-base-content/60">
          {scannedAt
            ? `Scanned ${new Date(scannedAt).toLocaleString()}`
            : "Reading latest issues..."}
        </span>
      </div>

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body py-5 gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">PSI Issues</h1>
            <p className="text-sm text-base-content/70 break-all">
              {finalUrl ?? "Loading URL..."}
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
    </>
  );
}

export function PsiIssuesToolbar({
  category,
  categoryCounts,
  selectedCategoryLabel,
  isBusy,
  visibleIssues,
  allIssues,
  onCategoryChange,
  onCopy,
  onExport,
  onExportCsv,
}: {
  category: CategoryTab;
  categoryCounts: Record<CategoryTab, number>;
  selectedCategoryLabel: string;
  isBusy: boolean;
  visibleIssues: PsiIssue[];
  allIssues: PsiIssue[];
  onCategoryChange: (next: CategoryTab) => void;
  onCopy: (data: ExportPayload, toastMessage: string) => void;
  onExport: (data: ExportPayload) => void;
  onExportCsv: (issues: PsiIssue[], variant: "all" | "current") => void;
}) {
  const exportCurrentCategory: ExportPayload =
    category === "all" ? { mode: "issues" } : { mode: "category", category };

  const categoryLabelLower = selectedCategoryLabel.toLowerCase();

  return (
    <div className="sticky top-0 z-[2] -mx-2 px-2 py-2 bg-base-100/95 backdrop-blur-sm border-b border-base-300/60">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CategoryTabs
          category={category}
          categoryCounts={categoryCounts}
          onCategoryChange={onCategoryChange}
        />
        <ExportMenu
          allIssues={allIssues}
          categoryLabelLower={categoryLabelLower}
          exportCurrentCategory={exportCurrentCategory}
          isBusy={isBusy}
          onCopy={onCopy}
          onExport={onExport}
          onExportCsv={onExportCsv}
          visibleIssues={visibleIssues}
        />
      </div>
    </div>
  );
}

function CategoryTabs({
  category,
  categoryCounts,
  onCategoryChange,
}: {
  category: CategoryTab;
  categoryCounts: Record<CategoryTab, number>;
  onCategoryChange: (next: CategoryTab) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {categoryTabs.map((tab) => (
        <button
          key={tab}
          className={`pb-2 border-b-2 text-sm font-medium transition-colors ${
            category === tab
              ? "border-primary text-base-content"
              : "border-transparent text-base-content/60 hover:text-base-content"
          }`}
          onClick={() => onCategoryChange(tab)}
        >
          <span>{categoryLabel(tab)}</span>
          <span className="ml-1 text-xs opacity-70">
            ({categoryCounts[tab]})
          </span>
        </button>
      ))}
    </div>
  );
}

function ExportMenu({
  allIssues,
  categoryLabelLower,
  exportCurrentCategory,
  isBusy,
  onCopy,
  onExport,
  onExportCsv,
  visibleIssues,
}: {
  allIssues: PsiIssue[];
  categoryLabelLower: string;
  exportCurrentCategory: ExportPayload;
  isBusy: boolean;
  onCopy: (data: ExportPayload, toastMessage: string) => void;
  onExport: (data: ExportPayload) => void;
  onExportCsv: (issues: PsiIssue[], variant: "all" | "current") => void;
  visibleIssues: PsiIssue[];
}) {
  return (
    <div className="dropdown dropdown-end">
      <div tabIndex={0} role="button" className="btn btn-sm gap-1">
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
              onCopy(
                exportCurrentCategory,
                `Copied ${categoryLabelLower} issues`,
              )
            }
          >
            <Copy className="size-4" />
            Copy {categoryLabelLower} issues
          </button>
        </li>
        <li>
          <button
            disabled={isBusy}
            onClick={() => onCopy({ mode: "issues" }, "Copied all issues")}
          >
            <Copy className="size-4" />
            Copy all issues
          </button>
        </li>
        <li>
          <button
            disabled={isBusy}
            onClick={() =>
              onCopy({ mode: "full" }, "Copied full Lighthouse report")
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
            onClick={() => onExport(exportCurrentCategory)}
          >
            Download {categoryLabelLower} issues
          </button>
        </li>
        <li>
          <button
            disabled={isBusy}
            onClick={() => onExport({ mode: "issues" })}
          >
            Download all issues
          </button>
        </li>
        <li>
          <button disabled={isBusy} onClick={() => onExport({ mode: "full" })}>
            Download full Lighthouse report
          </button>
        </li>
        <li className="menu-title">
          <span>Download CSV</span>
        </li>
        <li>
          <button
            disabled={!visibleIssues.length}
            onClick={() => onExportCsv(visibleIssues, "current")}
          >
            Download {categoryLabelLower} issues
          </button>
        </li>
        <li>
          <button
            disabled={!allIssues.length}
            onClick={() => onExportCsv(allIssues, "all")}
          >
            Download all issues
          </button>
        </li>
      </ul>
    </div>
  );
}

export function PsiIssueList({
  issues,
  isLoading,
}: {
  issues: PsiIssue[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return <p className="text-sm text-base-content/60">Loading issues...</p>;
  }
  if (!issues.length) {
    return (
      <p className="text-sm text-base-content/60">
        No unresolved issues for this category.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {issues.map((issue) => (
        <PsiIssueCard
          key={`${issue.category}-${issue.auditKey}`}
          issue={issue}
        />
      ))}
    </div>
  );
}

function PsiIssueCard({ issue }: { issue: PsiIssue }) {
  return (
    <div className="card bg-base-200/30 border border-base-300">
      <div className="card-body p-5 gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge badge-outline">{issue.category}</span>
            <span
              className={`badge border ${severityBadgeClass(issue.severity)} gap-1`}
            >
              {severityIcon(issue.severity)}
              {issue.severity}
            </span>
            {issue.score != null ? (
              <div
                className="tooltip tooltip-top"
                data-tip="Lighthouse score from 0-100 for this audit. Lower means larger opportunity for improvement."
              >
                <span className="badge badge-ghost cursor-help">
                  Score {issue.score}
                </span>
              </div>
            ) : null}
          </div>

          {issue.impactMs != null || issue.impactBytes != null ? (
            <span className="text-xs text-base-content/60">
              Impact {issue.impactMs ?? 0}ms / {issue.impactBytes ?? 0} bytes
            </span>
          ) : null}
        </div>

        <p className="font-semibold leading-tight">{issue.title}</p>

        {issue.displayValue ? (
          <p className="text-sm text-base-content/70">{issue.displayValue}</p>
        ) : null}

        {issue.description ? (
          <div className="text-sm text-base-content/80 leading-relaxed">
            {renderInlineMarkdown(issue.description)}
          </div>
        ) : null}

        {issue.items.length > 0 ? (
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
        ) : null}
      </div>
    </div>
  );
}
