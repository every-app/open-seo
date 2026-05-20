import {
  EMPTY_PAGES_FILTERS,
  EMPTY_PERFORMANCE_FILTERS,
  type PagesFilters,
  type PerformanceFilters,
} from "@/client/features/audit/results/AuditResultsTableFilterLogic";

export function PagesFilterBar({
  filters,
  onChange,
  resultCount,
  totalCount,
}: {
  filters: PagesFilters;
  onChange: (filters: PagesFilters) => void;
  resultCount: number;
  totalCount: number;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-200/30 p-3">
      <div className="flex flex-wrap items-end gap-2">
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
        <FilterSummary
          resultCount={resultCount}
          totalCount={totalCount}
          onReset={() => onChange(EMPTY_PAGES_FILTERS)}
        />
      </div>
    </div>
  );
}

export function PerformanceFilterBar({
  filters,
  onChange,
  resultCount,
  totalCount,
}: {
  filters: PerformanceFilters;
  onChange: (filters: PerformanceFilters) => void;
  resultCount: number;
  totalCount: number;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-200/30 p-3">
      <div className="flex flex-wrap items-end gap-2">
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
        <TextFilter
          label="Max LCP s"
          value={filters.maxLcpSeconds}
          placeholder="2.5"
          type="number"
          onChange={(maxLcpSeconds) => onChange({ ...filters, maxLcpSeconds })}
        />
        <FilterSummary
          resultCount={resultCount}
          totalCount={totalCount}
          onReset={() => onChange(EMPTY_PERFORMANCE_FILTERS)}
        />
      </div>
    </div>
  );
}

export function EmptyTableMessage({ label }: { label: string }) {
  return <div className="py-6 text-center text-base-content/60">{label}</div>;
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
    <label className="form-control gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
        {label}
      </span>
      <input
        className="input input-bordered input-sm w-40 bg-base-100"
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
    <div className="form-control gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
        {label}
      </span>
      <div className="flex gap-1">
        <input
          className="input input-bordered input-sm w-20 bg-base-100"
          type="number"
          value={min}
          placeholder="Min"
          onChange={(event) => onMinChange(event.target.value)}
        />
        <input
          className="input input-bordered input-sm w-20 bg-base-100"
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
    <label className="form-control gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
        {label}
      </span>
      <select
        className="select select-bordered select-sm w-32 bg-base-100"
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

function FilterSummary({
  resultCount,
  totalCount,
  onReset,
}: {
  resultCount: number;
  totalCount: number;
  onReset: () => void;
}) {
  return (
    <div className="ml-auto flex items-center gap-2 pb-0.5 text-xs text-base-content/60">
      <span className="tabular-nums">
        {resultCount.toLocaleString()} of {totalCount.toLocaleString()}
      </span>
      <button className="btn btn-ghost btn-xs" onClick={onReset}>
        Clear
      </button>
    </div>
  );
}
