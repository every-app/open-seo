import {
  ChevronDown,
  Copy,
  Download,
  FileWarning,
  Info,
  Sheet,
  TriangleAlert,
} from "lucide-react";
import { PortalMenu } from "@/client/components/PortalMenu";
import type {
  CategoryTab,
  ExportPayload,
  LighthouseIssue,
  LighthouseMetrics,
  LighthouseScores,
} from "./types";
import { LighthouseIssueRow } from "./LighthouseIssueRow";
import { LighthouseIssuesSummary } from "./LighthouseIssuesSummary";
import { categoryLabel } from "./utils";
import { categoryTabs } from "./types";

export function LighthouseIssuesHeader({
  backLabel,
  onBack,
  scannedAt,
  finalUrl,
  scores,
  metrics,
  severityCounts,
}: {
  backLabel: string;
  onBack: () => void;
  scannedAt?: string;
  finalUrl?: string;
  scores?: LighthouseScores | null;
  metrics?: LighthouseMetrics | null;
  severityCounts: { critical: number; warning: number; info: number };
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <button className="btn btn-ghost btn-sm px-2" onClick={onBack}>
          ← 返回 {backLabel}
        </button>
        <span className="text-xs text-base-content/60">
          {scannedAt
            ? `扫描时间：${new Date(scannedAt).toLocaleString()}`
            : "正在读取最新问题…"}
        </span>
      </div>

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body py-5 gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Lighthouse 问题</h1>
            <p className="text-sm text-base-content/70 break-all">
              {finalUrl ?? "正在加载网址…"}
            </p>
          </div>
          <LighthouseIssuesSummary scores={scores} metrics={metrics} />
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="badge border border-error/30 bg-error/10 text-error/80 gap-1">
              <FileWarning className="size-3" />
              严重 {severityCounts.critical}
            </span>
            <span className="badge border border-warning/30 bg-warning/10 text-warning/80 gap-1">
              <TriangleAlert className="size-3" />
              警告 {severityCounts.warning}
            </span>
            <span className="badge border border-info/30 bg-info/10 text-info/80 gap-1">
              <Info className="size-3" />
              信息 {severityCounts.info}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

export function LighthouseIssuesToolbar({
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
  onExportSheets,
}: {
  category: CategoryTab;
  categoryCounts: Record<CategoryTab, number>;
  selectedCategoryLabel: string;
  isBusy: boolean;
  visibleIssues: LighthouseIssue[];
  allIssues: LighthouseIssue[];
  onCategoryChange: (next: CategoryTab) => void;
  onCopy: (data: ExportPayload, toastMessage: string) => void;
  onExport: (data: ExportPayload) => void;
  onExportCsv: (issues: LighthouseIssue[], variant: "all" | "current") => void;
  onExportSheets: (
    issues: LighthouseIssue[],
    variant: "all" | "current",
  ) => void;
}) {
  const exportCurrentCategory: ExportPayload =
    category === "all" ? { mode: "issues" } : { mode: "category", category };

  const categoryLabelLower = selectedCategoryLabel;

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
          onExportSheets={onExportSheets}
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
  onExportSheets,
  visibleIssues,
}: {
  allIssues: LighthouseIssue[];
  categoryLabelLower: string;
  exportCurrentCategory: ExportPayload;
  isBusy: boolean;
  onCopy: (data: ExportPayload, toastMessage: string) => void;
  onExport: (data: ExportPayload) => void;
  onExportCsv: (issues: LighthouseIssue[], variant: "all" | "current") => void;
  onExportSheets: (
    issues: LighthouseIssue[],
    variant: "all" | "current",
  ) => void;
  visibleIssues: LighthouseIssue[];
}) {
  return (
    <PortalMenu
      ariaLabel="导出 Lighthouse 问题"
      triggerClassName="btn btn-sm gap-1"
      triggerContent={
        <>
          <Download className="size-4" />
          导出
          <ChevronDown className="size-3 opacity-60" />
        </>
      }
      menuClassName="w-72 max-h-[min(30rem,70vh)] flex-nowrap overflow-y-auto"
    >
      {(close) => (
        <>
          <li className="menu-title">
            <span>导出到 Google 表格</span>
          </li>
          <li>
            <button
              disabled={!visibleIssues.length}
              onClick={() => {
                close();
                onExportSheets(visibleIssues, "current");
              }}
            >
              <Sheet className="size-4" />在 Google 表格中打开：{" "}
              {categoryLabelLower}
            </button>
          </li>
          <li>
            <button
              disabled={!allIssues.length}
              onClick={() => {
                close();
                onExportSheets(allIssues, "all");
              }}
            >
              <Sheet className="size-4" />在 Google 表格中打开全部可处理问题
            </button>
          </li>
          <li className="menu-title">
            <span>复制</span>
          </li>
          <li>
            <button
              disabled={isBusy}
              onClick={() => {
                close();
                onCopy(
                  exportCurrentCategory,
                  `已复制${categoryLabelLower}问题`,
                );
              }}
            >
              <Copy className="size-4" />
              复制{categoryLabelLower}问题
            </button>
          </li>
          <li>
            <button
              disabled={isBusy}
              onClick={() => {
                close();
                onCopy({ mode: "issues" }, "全部可处理问题已复制");
              }}
            >
              <Copy className="size-4" />
              复制全部可处理问题
            </button>
          </li>
          <li>
            <button
              disabled={isBusy}
              onClick={() => {
                close();
                onCopy({ mode: "full" }, "已保存的 Lighthouse 数据已复制");
              }}
            >
              <Copy className="size-4" />
              复制已保存的 Lighthouse 数据
            </button>
          </li>
          <li className="menu-title">
            <span>下载 JSON</span>
          </li>
          <li>
            <button
              disabled={isBusy}
              onClick={() => {
                close();
                onExport(exportCurrentCategory);
              }}
            >
              下载{categoryLabelLower}问题
            </button>
          </li>
          <li>
            <button
              disabled={isBusy}
              onClick={() => {
                close();
                onExport({ mode: "issues" });
              }}
            >
              下载全部可处理问题
            </button>
          </li>
          <li>
            <button
              disabled={isBusy}
              onClick={() => {
                close();
                onExport({ mode: "full" });
              }}
            >
              下载已保存的 Lighthouse 数据
            </button>
          </li>
          <li className="menu-title">
            <span>下载 CSV</span>
          </li>
          <li>
            <button
              disabled={!visibleIssues.length}
              onClick={() => {
                close();
                onExportCsv(visibleIssues, "current");
              }}
            >
              下载{categoryLabelLower}问题
            </button>
          </li>
          <li>
            <button
              disabled={!allIssues.length}
              onClick={() => {
                close();
                onExportCsv(allIssues, "all");
              }}
            >
              下载全部可处理问题
            </button>
          </li>
        </>
      )}
    </PortalMenu>
  );
}

export function LighthouseIssueList({
  issues,
  isLoading,
  emptyMessage,
}: {
  issues: LighthouseIssue[];
  isLoading: boolean;
  emptyMessage?: string;
}) {
  if (isLoading) {
    return <p className="text-sm text-base-content/60">正在加载问题…</p>;
  }
  if (!issues.length) {
    return (
      <p className="text-sm text-base-content/60">
        {emptyMessage ?? "此分类下没有可处理的问题。"}
      </p>
    );
  }
  return (
    <table className="table table-sm w-full table-fixed">
      <colgroup>
        <col className="w-8" />
        <col className="w-24" />
        <col />
        <col className="w-28 hidden sm:table-column" />
        <col className="w-28 hidden md:table-column" />
        <col className="w-14" />
      </colgroup>
      <thead>
        <tr className="text-xs text-base-content/50 uppercase tracking-wide border-b border-base-300">
          <th />
          <th className="font-medium">严重程度</th>
          <th className="font-medium">问题</th>
          <th className="font-medium hidden sm:table-cell">分类</th>
          <th className="font-medium hidden md:table-cell text-right">影响</th>
          <th className="font-medium text-right">难度</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-base-300/60">
        {issues.map((issue, issueIndex) => (
          <LighthouseIssueRow
            key={`${issue.category}-${issue.auditKey}-${issueIndex}`}
            issue={issue}
          />
        ))}
      </tbody>
    </table>
  );
}
