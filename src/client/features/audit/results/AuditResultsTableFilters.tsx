import { RotateCcw, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import type {
  PagesFilters,
  PerformanceFilters,
} from "@/client/features/audit/results/AuditResultsTableFilterLogic";

export function PagesFilterBar({
  filters,
  onChange,
  activeFilterCount,
  onReset,
}: {
  filters: PagesFilters;
  onChange: (filters: PagesFilters) => void;
  activeFilterCount: number;
  onReset: () => void;
}) {
  return (
    <FilterPanel activeFilterCount={activeFilterCount} onReset={onReset}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <TextFilter
          label="Search"
          value={filters.query}
          placeholder="URL, title, meta"
          onChange={(query) => onChange({ ...filters, query })}
        />
        <SelectFilter
          label="Status"
          value={filters.status}
          onChange={(status) => onChange({ ...filters, status })}
          options={[
            ["all", "All"],
            ["ok", "2xx"],
            ["redirect", "3xx"],
            ["error", "4xx/5xx"],
            ["missing", "Missing"],
          ]}
        />
        <SelectFilter
          label="Alt text"
          value={filters.missingAlt}
          onChange={(missingAlt) => onChange({ ...filters, missingAlt })}
          options={[
            ["all", "All"],
            ["yes", "Missing alt"],
            ["no", "No missing alt"],
          ]}
        />
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <RangeFilter
          label="Words"
          min={filters.minWords}
          max={filters.maxWords}
          onMinChange={(minWords) => onChange({ ...filters, minWords })}
          onMaxChange={(maxWords) => onChange({ ...filters, maxWords })}
        />
        <RangeFilter
          label="Speed ms"
          min={filters.minResponseMs}
          max={filters.maxResponseMs}
          onMinChange={(minResponseMs) =>
            onChange({ ...filters, minResponseMs })
          }
          onMaxChange={(maxResponseMs) =>
            onChange({ ...filters, maxResponseMs })
          }
        />
      </div>
    </FilterPanel>
  );
}

export function PerformanceFilterBar({
  filters,
  onChange,
  activeFilterCount,
  onReset,
}: {
  filters: PerformanceFilters;
  onChange: (filters: PerformanceFilters) => void;
  activeFilterCount: number;
  onReset: () => void;
}) {
  return (
    <FilterPanel activeFilterCount={activeFilterCount} onReset={onReset}>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
        <TextFilter
          label="Search"
          value={filters.query}
          placeholder="URL"
          onChange={(query) => onChange({ ...filters, query })}
        />
        <SelectFilter
          label="Device"
          value={filters.device}
          onChange={(device) => onChange({ ...filters, device })}
          options={[
            ["all", "All"],
            ["desktop", "Desktop"],
            ["mobile", "Mobile"],
          ]}
        />
        <SelectFilter
          label="Status"
          value={filters.status}
          onChange={(status) => onChange({ ...filters, status })}
          options={[
            ["all", "All"],
            ["ok", "OK"],
            ["failed", "Failed"],
          ]}
        />
        <TextFilter
          label="Max LCP s"
          value={filters.maxLcpSeconds}
          placeholder="2.5"
          type="number"
          onChange={(maxLcpSeconds) => onChange({ ...filters, maxLcpSeconds })}
        />
      </div>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <RangeFilter
          label="Perf"
          min={filters.minPerf}
          max={filters.maxPerf}
          onMinChange={(minPerf) => onChange({ ...filters, minPerf })}
          onMaxChange={(maxPerf) => onChange({ ...filters, maxPerf })}
        />
        <RangeFilter
          label="SEO"
          min={filters.minSeo}
          max={filters.maxSeo}
          onMinChange={(minSeo) => onChange({ ...filters, minSeo })}
          onMaxChange={(maxSeo) => onChange({ ...filters, maxSeo })}
        />
      </div>
    </FilterPanel>
  );
}

export function EmptyTableMessage({ label }: { label: string }) {
  return <div className="py-6 text-center text-base-content/60">{label}</div>;
}

export function TableFilterToggle({
  showFilters,
  onToggle,
  activeFilterCount,
  resultCount,
  totalCount,
}: {
  showFilters: boolean;
  onToggle: () => void;
  activeFilterCount: number;
  resultCount: number;
  totalCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 px-4 py-2.5">
      <button
        className={`btn btn-ghost btn-sm gap-1.5 ${showFilters ? "btn-active" : ""}`}
        onClick={onToggle}
        title="Toggle filters"
        type="button"
      >
        <SlidersHorizontal className="size-3.5" />
        Filters
        {activeFilterCount > 0 ? (
          <span className="badge badge-xs badge-primary border-0 text-primary-content">
            {activeFilterCount}
          </span>
        ) : null}
      </button>
      <span className="text-sm tabular-nums text-base-content/60">
        {resultCount.toLocaleString()} of {totalCount.toLocaleString()}
      </span>
    </div>
  );
}

export function countActiveFilters<TFilters extends Record<string, string>>(
  filters: TFilters,
  emptyFilters: TFilters,
) {
  return Object.keys(filters).reduce((count, key) => {
    const filterKey = key as keyof TFilters;
    return filters[filterKey] !== emptyFilters[filterKey] ? count + 1 : count;
  }, 0);
}

function FilterPanel({
  activeFilterCount,
  onReset,
  children,
}: {
  activeFilterCount: number;
  onReset: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 border-b border-base-300 bg-gradient-to-b from-base-100 to-base-200/30 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Refine results</p>
          {activeFilterCount > 0 ? (
            <span className="badge badge-xs badge-primary border-0 text-primary-content">
              {activeFilterCount} active
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-xs btn-ghost gap-1"
          onClick={onReset}
          disabled={activeFilterCount === 0}
        >
          <RotateCcw className="size-3" />
          Clear all
        </button>
      </div>
      {children}
    </div>
  );
}

function TextFilter({
  label,
  value,
  placeholder,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  type?: "text" | "number";
  onChange: (value: string) => void;
}) {
  return (
    <label className="form-control gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
        {label}
      </span>
      <input
        className="input input-bordered input-sm w-full bg-base-100"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function RangeFilter({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  min: string;
  max: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-base-300 bg-base-100 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <input
          className="input input-bordered input-xs bg-base-100"
          type="number"
          value={min}
          placeholder="Min"
          onChange={(event) => onMinChange(event.target.value)}
        />
        <input
          className="input input-bordered input-xs bg-base-100"
          type="number"
          value={max}
          placeholder="Max"
          onChange={(event) => onMaxChange(event.target.value)}
        />
      </div>
    </div>
  );
}

function SelectFilter<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="form-control gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
        {label}
      </span>
      <select
        className="select select-bordered select-sm w-full bg-base-100"
        value={value}
        onChange={(event) => {
          const selected = options.find(
            ([optionValue]) => optionValue === event.target.value,
          )?.[0];
          if (selected != null) onChange(selected);
        }}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
