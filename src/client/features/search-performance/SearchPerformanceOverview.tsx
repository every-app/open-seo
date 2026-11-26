import { Card, CardContent } from "@/client/components/ui/card";
import { BiggestChangesCard } from "@/client/features/search-performance/SearchPerformanceChanges";
import { SearchPerformanceChart } from "@/client/features/search-performance/SearchPerformanceChart";
import type { Report } from "@/client/features/search-performance/SearchPerformanceColumns";
import type {
  DetailSelection,
  FilterInput,
} from "@/client/features/search-performance/searchPerformanceQueries";

/**
 * The part of the page above the tables: the metric chart and the biggest
 * changes against the previous period.
 */
export function SearchPerformanceOverview({
  projectId,
  report,
  filterInput,
  isWeb,
  showPosition,
  isPlaceholderData,
  onSelect,
}: {
  projectId: string;
  report: Report;
  filterInput: FilterInput;
  isWeb: boolean;
  /** Discover and Google News report pages only, with no position. */
  showPosition: boolean;
  /** The previous filters' report is still on screen while the next loads. */
  isPlaceholderData: boolean;
  onSelect: (selection: DetailSelection) => void;
}) {
  return (
    <>
      <Card
        size="lg"
        className={`transition-opacity ${isPlaceholderData ? "opacity-50" : ""}`}
      >
        <CardContent>
          <SearchPerformanceChart
            // A search type without position drops that metric.
            key={showPosition ? "with-position" : "without-position"}
            totals={report.totals}
            prevTotals={report.prevTotals}
            trend={report.trend}
            prevTrend={report.prevTrend}
            showPosition={showPosition}
          />
        </CardContent>
      </Card>
      <BiggestChangesCard
        projectId={projectId}
        filterInput={filterInput}
        isWeb={isWeb}
        showPosition={showPosition}
        comparedWith={`Compared with ${report.range.prevStartDate} to ${report.range.prevEndDate}`}
        onSelect={onSelect}
      />
    </>
  );
}
