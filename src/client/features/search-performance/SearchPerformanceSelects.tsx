import {
  SEARCH_PERFORMANCE_RANGES,
  type SearchPerformanceDateRange,
} from "@/types/schemas/search-performance";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";

export const DATE_RANGE_LABELS: Record<SearchPerformanceDateRange, string> = {
  last_7_days: "Last 7 days",
  last_28_days: "Last 28 days",
  last_3_months: "Last 3 months",
};
const RANGE_OPTIONS = SEARCH_PERFORMANCE_RANGES.map((value) => ({
  value,
  label: DATE_RANGE_LABELS[value],
}));

function isDateRange(value: string): value is SearchPerformanceDateRange {
  return SEARCH_PERFORMANCE_RANGES.some((option) => option === value);
}

export function DateRangeSelect({
  value,
  onChange,
  triggerClassName,
}: {
  value: SearchPerformanceDateRange;
  onChange: (value: SearchPerformanceDateRange) => void;
  triggerClassName?: string;
}) {
  return (
    <Select
      items={RANGE_OPTIONS}
      value={value}
      onValueChange={(next) => {
        if (next != null && isDateRange(next)) onChange(next);
      }}
    >
      <SelectTrigger
        size="sm"
        className={triggerClassName}
        aria-label="Date range"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {RANGE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
