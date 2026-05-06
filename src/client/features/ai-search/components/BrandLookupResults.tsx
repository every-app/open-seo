import { useMemo, useState } from "react";
import { type SortingState } from "@tanstack/react-table";
import { Download, Info, SlidersHorizontal } from "lucide-react";
import { useAppTable } from "@/client/components/table/AppDataTable";
import { ExportToSheetsButton } from "@/client/components/table/ExportToSheetsButton";
import {
  buildBrandLookupExport,
  downloadBrandLookupCsv,
} from "@/client/features/ai-search/components/brandLookupExport";
import { BrandLookupMentionTrendCard } from "@/client/features/ai-search/components/BrandLookupMentionTrendCard";
import { BrandLookupFilterPanel } from "@/client/features/ai-search/components/BrandLookupFilterPanel";
import {
  TopPagesTable,
  TopQueriesTable,
  topPagesColumns,
  topQueriesColumns,
} from "@/client/features/ai-search/components/BrandLookupCitationTables";
import {
  formatCount,
  formatPlatformLabel,
} from "@/client/features/ai-search/platformLabels";
import {
  filterQueries,
  filterTopPages,
} from "@/client/features/ai-search/brandLookupFiltering";
import { useBrandLookupFilters } from "@/client/features/ai-search/useBrandLookupFilters";
import type { CitationTab } from "@/client/features/ai-search/brandLookupFilterTypes";
import type { BrandLookupResult } from "@/types/schemas/ai-search";

type Props = {
  result: BrandLookupResult;
};

type PlatformRow = BrandLookupResult["perPlatform"][number];
type MetricKey = "mentions" | "aiSearchVolume" | "impressions";

const PLATFORM_DOT_CLASS: Record<PlatformRow["platform"], string> = {
  chat_gpt: "bg-emerald-500",
  google: "bg-sky-500",
};

export function BrandLookupResults({ result }: Props) {
  const erroredPlatforms = result.perPlatform.filter(
    (p) => p.status === "error",
  );
  const allPlatformsErrored =
    erroredPlatforms.length === result.perPlatform.length &&
    result.perPlatform.length > 0;

  if (!result.hasData) {
    if (allPlatformsErrored) {
      return (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
          AI mention data is temporarily unavailable for{" "}
          <strong>{result.resolvedTarget}</strong>. Please try again shortly.
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-info/30 bg-info/10 p-4 text-sm">
          No AI mentions found for <strong>{result.resolvedTarget}</strong>.
        </div>
        {erroredPlatforms.length > 0 ? (
          <p className="text-xs text-base-content/60">
            Note: {formatPlatformList(erroredPlatforms.map((p) => p.platform))}{" "}
            {erroredPlatforms.length === 1 ? "was" : "were"} unavailable — some
            mentions may be missing.
          </p>
        ) : null}
      </div>
    );
  }

  const hasTrendData = result.monthlyVolume.length > 0;

  return (
    <div className="space-y-6">
      <BrandHeader result={result} />
      <div
        className={`grid gap-4 ${hasTrendData ? "lg:grid-cols-2" : "grid-cols-1"}`}
      >
        <KpiTiles result={result} />
        {hasTrendData ? <MentionTrendCard result={result} /> : null}
      </div>
      <CitationTabsCard result={result} />
    </div>
  );
}

function formatPlatformList(platforms: PlatformRow["platform"][]): string {
  return platforms.map(formatPlatformLabel).join(" and ");
}

function BrandHeader({ result }: { result: BrandLookupResult }) {
  return (
    <section className="flex flex-wrap items-baseline justify-between gap-2">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-3xl font-semibold tracking-tight">
          {result.resolvedTarget}
        </h2>
        <span className="badge badge-ghost badge-sm">
          {result.detectedTargetType}
        </span>
      </div>
      <p className="text-xs text-base-content/50">
        Updated {formatRelative(result.fetchedAt)}
      </p>
    </section>
  );
}

function KpiTiles({ result }: { result: BrandLookupResult }) {
  return (
    <section className="flex flex-col divide-y divide-base-200 overflow-hidden rounded-xl border border-base-300 bg-base-100">
      <KpiTile
        label="Total mentions"
        tooltip="Number of LLM answers where your domain appeared in the text or citations."
        total={result.totalMentions}
        perPlatform={result.perPlatform}
        metric="mentions"
      />
      <KpiTile
        label="AI search volume"
        tooltip="Monthly volume of user prompts on topics where your domain shows up in LLM answers."
        total={result.totalAiSearchVolume}
        perPlatform={result.perPlatform}
        metric="aiSearchVolume"
      />
      <KpiTile
        label="Estimated impressions"
        tooltip="How often your domain is shown to users across LLM answers, based on mention frequency and topic search volume."
        total={result.totalImpressions}
        perPlatform={result.perPlatform}
        metric="impressions"
      />
    </section>
  );
}

function KpiTile({
  label,
  tooltip,
  total,
  perPlatform,
  metric,
}: {
  label: string;
  tooltip: string;
  total: number | null;
  perPlatform: PlatformRow[];
  metric: MetricKey;
}) {
  return (
    <div className="flex flex-1 items-center justify-between gap-6 px-5 py-3">
      <div className="min-w-0">
        <p className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider text-base-content/50">
          {label}
          <span
            className="tooltip tooltip-right inline-flex normal-case"
            data-tip={tooltip}
          >
            <Info className="size-3 text-base-content/40" />
          </span>
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {formatCount(total)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col gap-1.5 min-w-[12rem]">
        {perPlatform.map((row) => (
          <PlatformStatRow key={row.platform} row={row} metric={metric} />
        ))}
      </div>
    </div>
  );
}

function PlatformStatRow({
  row,
  metric,
}: {
  row: PlatformRow;
  metric: MetricKey;
}) {
  const value = row.status === "error" ? null : row[metric];

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="inline-flex items-center gap-1.5 text-base-content/70">
        <span
          className={`size-1.5 rounded-full ${PLATFORM_DOT_CLASS[row.platform]}`}
        />
        {formatPlatformLabel(row.platform)}
        {row.platform === "chat_gpt" ? (
          <span
            className="tooltip tooltip-right inline-flex"
            data-tip="DataForSEO indexes ChatGPT mentions for US English only — country selection is not available for this platform."
          >
            <Info className="size-3 text-base-content/40" />
          </span>
        ) : null}
        {row.status === "error" ? (
          <span className="text-error">unavailable</span>
        ) : null}
      </span>
      <span className="font-medium tabular-nums text-base-content/90">
        {formatCount(value)}
      </span>
    </div>
  );
}

function MentionTrendCard({ result }: { result: BrandLookupResult }) {
  return (
    <section className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
      <div className="border-b border-base-300 px-4 py-3">
        <h3 className="text-sm font-semibold">
          Mention trend (last 12 months)
        </h3>
      </div>
      <div className="p-4">
        <BrandLookupMentionTrendCard result={result} />
      </div>
    </section>
  );
}

const DEFAULT_PAGES_SORT: SortingState = [{ id: "mentions", desc: true }];
const DEFAULT_QUERIES_SORT: SortingState = [
  { id: "aiSearchVolume", desc: true },
];

function CitationTabsCard({ result }: { result: BrandLookupResult }) {
  const [activeTab, setActiveTab] = useState<CitationTab>("queries");
  const [pagesSort, setPagesSort] = useState<SortingState>(DEFAULT_PAGES_SORT);
  const [queriesSort, setQueriesSort] =
    useState<SortingState>(DEFAULT_QUERIES_SORT);
  const filters = useBrandLookupFilters();

  const filteredPages = useMemo(
    () => filterTopPages(result.topPages, filters.pages.values),
    [result.topPages, filters.pages.values],
  );
  const filteredQueries = useMemo(
    () => filterQueries(result.topQueries, filters.queries.values),
    [result.topQueries, filters.queries.values],
  );

  const pagesTable = useAppTable({
    data: filteredPages,
    columns: topPagesColumns,
    state: { sorting: pagesSort },
    onSortingChange: setPagesSort,
    withSorting: true,
  });
  const queriesTable = useAppTable({
    data: filteredQueries,
    columns: topQueriesColumns,
    state: { sorting: queriesSort },
    onSortingChange: setQueriesSort,
    withSorting: true,
  });

  // Not memoized: TanStack's `getSortedRowModel()` is internally cached, and
  // memoing on the table refs alone (which are stable across renders) would
  // serve stale data when sort or filters change.
  const exportTable = buildBrandLookupExport(
    activeTab,
    pagesTable.getSortedRowModel().rows.map((row) => row.original),
    queriesTable.getSortedRowModel().rows.map((row) => row.original),
  );

  const handleExport = () =>
    downloadBrandLookupCsv(activeTab, result.resolvedTarget, exportTable);

  const canExport = exportTable.rows.length > 0;

  const currentFilterCount = filters[activeTab].activeFilterCount;

  return (
    <section className="overflow-hidden rounded-xl border border-base-300 bg-base-100">
      <div className="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-3">
        <div role="tablist" className="tabs tabs-box w-fit">
          <button
            type="button"
            role="tab"
            className={`tab ${activeTab === "queries" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("queries")}
          >
            Queries
          </button>
          <button
            type="button"
            role="tab"
            className={`tab ${activeTab === "pages" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("pages")}
          >
            Related pages
          </button>
        </div>

        <div className="flex items-center gap-2">
          <ExportToSheetsButton
            headers={exportTable.headers}
            rows={exportTable.rows}
            feature={`brand_lookup_${activeTab}`}
            className="btn-sm"
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-1.5"
            onClick={handleExport}
            disabled={!canExport}
            aria-label="Export current tab as CSV"
          >
            <Download className="size-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-base-300 px-4 py-2">
        <button
          type="button"
          className={`btn btn-ghost btn-sm gap-1.5 ${filters.showFilters ? "btn-active" : ""}`}
          onClick={() => filters.setShowFilters((current) => !current)}
          title="Toggle table filters"
        >
          <SlidersHorizontal className="size-3.5" />
          Filters
          {currentFilterCount > 0 ? (
            <span className="badge badge-xs badge-primary border-0 text-primary-content">
              {currentFilterCount}
            </span>
          ) : null}
        </button>
      </div>

      <div className="border-b border-base-300 px-4 py-2 text-xs text-base-content/60">
        {activeTab === "pages" ? (
          <>
            Other pages LLMs cited in the same answers that referenced{" "}
            <strong className="text-base-content/80">
              {result.resolvedTarget}
            </strong>
            . Useful for spotting the sources competing for attention alongside
            your domain.
          </>
        ) : (
          <>
            User prompts where the LLM's answer referenced{" "}
            <strong className="text-base-content/80">
              {result.resolvedTarget}
            </strong>{" "}
            in its text or citations. The prompt itself does not have to mention
            your domain.
          </>
        )}
      </div>

      {filters.showFilters ? (
        <BrandLookupFilterPanel activeTab={activeTab} filters={filters} />
      ) : null}

      {activeTab === "pages" ? (
        <TopPagesTable table={pagesTable} />
      ) : (
        <TopQueriesTable table={queriesTable} />
      )}
    </section>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "just now";

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
