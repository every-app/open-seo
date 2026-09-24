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

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/client/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
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
        <Button variant="ghost" size="sm" className="px-2" onClick={onBack}>
          &larr; Back to {backLabel}
        </Button>
        <span className="text-xs text-muted-foreground">
          {scannedAt
            ? `Scanned ${new Date(scannedAt).toLocaleString()}`
            : "Reading latest issues..."}
        </span>
      </div>

      <Card>
        <CardContent className="py-5 gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Lighthouse Issues</h1>
            <p className="text-sm text-muted-foreground break-all">
              {finalUrl ?? "Loading URL..."}
            </p>
          </div>
          <LighthouseIssuesSummary scores={scores} metrics={metrics} />
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge
              variant="secondary"
              className="border border-destructive/30 bg-destructive/10 text-destructive/80 gap-1"
            >
              <FileWarning className="size-3" />
              Critical {severityCounts.critical}
            </Badge>
            <Badge
              variant="secondary"
              className="border border-warning/30 bg-warning/10 text-warning/80 gap-1"
            >
              <TriangleAlert className="size-3" />
              Warning {severityCounts.warning}
            </Badge>
            <Badge
              variant="secondary"
              className="border border-info/30 bg-info/10 text-info/80 gap-1"
            >
              <Info className="size-3" />
              Info {severityCounts.info}
            </Badge>
          </div>
        </CardContent>
      </Card>
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

  const categoryLabelLower = selectedCategoryLabel.toLowerCase();

  return (
    <div className="sticky top-0 z-[2] -mx-2 px-2 py-2 bg-card/95 backdrop-blur-sm border-b border-border/60">
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
    <Tabs value={category}>
      <TabsList className="flex-wrap">
        {categoryTabs.map((tab) => (
          <TabsTrigger
            key={tab}
            value={tab}
            onClick={() => onCategoryChange(tab)}
          >
            <span>{categoryLabel(tab)}</span>
            <span className="ml-1 text-xs opacity-70">
              ({categoryCounts[tab]})
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
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
      ariaLabel="Export Lighthouse issues"
      triggerVariant="outline"
      triggerSize="sm"
      triggerClassName="gap-1"
      triggerContent={
        <>
          <Download className="size-4" />
          Export
          <ChevronDown className="size-3 opacity-60" />
        </>
      }
      menuClassName="w-72 max-h-[min(30rem,70vh)] overflow-y-auto"
    >
      {(close) => (
        <>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Export to Sheets</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!visibleIssues.length}
              onClick={() => {
                close();
                onExportSheets(visibleIssues, "current");
              }}
            >
              <Sheet className="size-4" />
              Open in Sheets — {categoryLabelLower}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!allIssues.length}
              onClick={() => {
                close();
                onExportSheets(allIssues, "all");
              }}
            >
              <Sheet className="size-4" />
              Open in Sheets — all actionable
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Copy</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={isBusy}
              onClick={() => {
                close();
                onCopy(
                  exportCurrentCategory,
                  `Copied ${categoryLabelLower} issues`,
                );
              }}
            >
              <Copy className="size-4" />
              Copy {categoryLabelLower} issues
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isBusy}
              onClick={() => {
                close();
                onCopy({ mode: "issues" }, "Copied all actionable issues");
              }}
            >
              <Copy className="size-4" />
              Copy all actionable issues
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isBusy}
              onClick={() => {
                close();
                onCopy({ mode: "full" }, "Copied saved Lighthouse payload");
              }}
            >
              <Copy className="size-4" />
              Copy saved Lighthouse payload
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Download JSON</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={isBusy}
              onClick={() => {
                close();
                onExport(exportCurrentCategory);
              }}
            >
              Download {categoryLabelLower} issues
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isBusy}
              onClick={() => {
                close();
                onExport({ mode: "issues" });
              }}
            >
              Download all actionable issues
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={isBusy}
              onClick={() => {
                close();
                onExport({ mode: "full" });
              }}
            >
              Download saved Lighthouse payload
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Download CSV</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={!visibleIssues.length}
              onClick={() => {
                close();
                onExportCsv(visibleIssues, "current");
              }}
            >
              Download {categoryLabelLower} issues
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!allIssues.length}
              onClick={() => {
                close();
                onExportCsv(allIssues, "all");
              }}
            >
              Download all actionable issues
            </DropdownMenuItem>
          </DropdownMenuGroup>
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
    return <p className="text-sm text-muted-foreground">Loading issues...</p>;
  }
  if (!issues.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {emptyMessage ?? "No actionable issues for this category."}
      </p>
    );
  }
  return (
    <Table className="w-full">
      <colgroup>
        <col className="w-8" />
        <col className="w-24" />
        <col />
        <col className="w-28 hidden sm:table-column" />
        <col className="w-28 hidden md:table-column" />
        <col className="w-14" />
      </colgroup>
      <TableHeader>
        <TableRow className="text-xs text-muted-foreground/70 uppercase tracking-wide border-b border-border">
          <TableHead />
          <TableHead className="font-medium">Severity</TableHead>
          <TableHead className="font-medium">Issue</TableHead>
          <TableHead className="font-medium hidden sm:table-cell">
            Category
          </TableHead>
          <TableHead className="font-medium hidden md:table-cell text-right">
            Impact
          </TableHead>
          <TableHead className="font-medium text-right">Score</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="divide-y divide-border/60">
        {issues.map((issue, issueIndex) => (
          <LighthouseIssueRow
            key={`${issue.category}-${issue.auditKey}-${issueIndex}`}
            issue={issue}
          />
        ))}
      </TableBody>
    </Table>
  );
}
