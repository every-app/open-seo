import {
  hasActiveMetricFilters,
  SEARCH_PERFORMANCE_METRIC_FILTER_ROW_LIMIT,
  type SearchPerformanceMetricFilters,
} from "@/types/schemas/search-performance";

export type SearchPerformanceAdvancedFilterValues = {
  pagePath: string;
  minImpressions: string;
  maxImpressions: string;
  minClicks: string;
  maxClicks: string;
  minPosition: string;
  maxPosition: string;
};

export const EMPTY_SEARCH_PERFORMANCE_ADVANCED_FILTERS: SearchPerformanceAdvancedFilterValues =
  {
    pagePath: "",
    minImpressions: "",
    maxImpressions: "",
    minClicks: "",
    maxClicks: "",
    minPosition: "",
    maxPosition: "",
  };

type MetricParseMode = "nonNegativeInt" | "positiveNumber";

function parseOptionalNonNegativeInt(value: string): number | undefined {
  if (!value.trim()) return undefined;
  if (validateMetricValue(value, "nonNegativeInt")) return undefined;
  return Math.trunc(Number(value));
}

function parseOptionalPositiveNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  if (validateMetricValue(value, "positiveNumber")) return undefined;
  return Number(value);
}

export function validateMetricValue(
  value: string,
  mode: MetricParseMode,
): string | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "Enter a valid number";
  if (mode === "nonNegativeInt" && parsed < 0) {
    return "Must be 0 or greater";
  }
  if (mode === "positiveNumber" && parsed <= 0) {
    return "Must be greater than 0";
  }
  return undefined;
}

function validateMetricRange(
  minValue: string,
  maxValue: string,
  mode: MetricParseMode,
): { min?: string; max?: string } {
  const minError = validateMetricValue(minValue, mode);
  const maxError = validateMetricValue(maxValue, mode);
  if (minError || maxError) {
    return {
      ...(minError ? { min: minError } : {}),
      ...(maxError ? { max: maxError } : {}),
    };
  }
  if (!minValue.trim() || !maxValue.trim()) return {};

  const min =
    mode === "nonNegativeInt" ? Math.trunc(Number(minValue)) : Number(minValue);
  const max =
    mode === "nonNegativeInt" ? Math.trunc(Number(maxValue)) : Number(maxValue);
  if (min > max) {
    return { min: "Min cannot exceed max", max: "Min cannot exceed max" };
  }
  return {};
}

export function getAdvancedSearchPerformanceFilterErrors(
  values: SearchPerformanceAdvancedFilterValues,
): Partial<Record<keyof SearchPerformanceAdvancedFilterValues, string>> {
  const errors: Partial<
    Record<keyof SearchPerformanceAdvancedFilterValues, string>
  > = {};

  const impressions = validateMetricRange(
    values.minImpressions,
    values.maxImpressions,
    "nonNegativeInt",
  );
  if (impressions.min) errors.minImpressions = impressions.min;
  if (impressions.max) errors.maxImpressions = impressions.max;

  const clicks = validateMetricRange(
    values.minClicks,
    values.maxClicks,
    "nonNegativeInt",
  );
  if (clicks.min) errors.minClicks = clicks.min;
  if (clicks.max) errors.maxClicks = clicks.max;

  const position = validateMetricRange(
    values.minPosition,
    values.maxPosition,
    "positiveNumber",
  );
  if (position.min) errors.minPosition = position.min;
  if (position.max) errors.maxPosition = position.max;

  return errors;
}

function hasAdvancedSearchPerformanceFilterErrors(
  values: SearchPerformanceAdvancedFilterValues,
): boolean {
  return (
    Object.keys(getAdvancedSearchPerformanceFilterErrors(values)).length > 0
  );
}

export function compileAdvancedSearchPerformanceFilters(
  values: SearchPerformanceAdvancedFilterValues,
): SearchPerformanceMetricFilters {
  const errors = getAdvancedSearchPerformanceFilterErrors(values);
  const pagePath = values.pagePath.trim();
  const result: SearchPerformanceMetricFilters = {};

  if (pagePath) result.pagePath = pagePath;

  if (!errors.minImpressions && !errors.maxImpressions) {
    const minImpressions = parseOptionalNonNegativeInt(values.minImpressions);
    const maxImpressions = parseOptionalNonNegativeInt(values.maxImpressions);
    if (minImpressions !== undefined) result.minImpressions = minImpressions;
    if (maxImpressions !== undefined) result.maxImpressions = maxImpressions;
  }

  if (!errors.minClicks && !errors.maxClicks) {
    const minClicks = parseOptionalNonNegativeInt(values.minClicks);
    const maxClicks = parseOptionalNonNegativeInt(values.maxClicks);
    if (minClicks !== undefined) result.minClicks = minClicks;
    if (maxClicks !== undefined) result.maxClicks = maxClicks;
  }

  if (!errors.minPosition && !errors.maxPosition) {
    const minPosition = parseOptionalPositiveNumber(values.minPosition);
    const maxPosition = parseOptionalPositiveNumber(values.maxPosition);
    if (minPosition !== undefined) result.minPosition = minPosition;
    if (maxPosition !== undefined) result.maxPosition = maxPosition;
  }

  return result;
}

export function countActiveAdvancedSearchPerformanceFilters(
  values: SearchPerformanceAdvancedFilterValues,
): number {
  return Object.keys(compileAdvancedSearchPerformanceFilters(values)).length;
}

type MetricRangeFieldProps = {
  label: string;
  minValue: string;
  maxValue: string;
  minError?: string;
  maxError?: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  minPlaceholder?: string;
  maxPlaceholder?: string;
  inputMode?: "numeric" | "decimal";
};

function MetricRangeField({
  label,
  minValue,
  maxValue,
  minError,
  maxError,
  onMinChange,
  onMaxChange,
  minPlaceholder = "Min",
  maxPlaceholder = "Max",
  inputMode = "numeric",
}: MetricRangeFieldProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-medium text-base-content/60">{label}</span>
      <div className="flex gap-1">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <input
            type="text"
            inputMode={inputMode}
            className={`input input-bordered input-sm w-full min-w-0 ${minError ? "input-error" : ""}`}
            placeholder={minPlaceholder}
            value={minValue}
            onChange={(event) => onMinChange(event.target.value)}
            aria-label={`${label} minimum`}
            aria-invalid={minError ? true : undefined}
          />
          {minError ? (
            <span className="text-xs text-error">{minError}</span>
          ) : null}
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <input
            type="text"
            inputMode={inputMode}
            className={`input input-bordered input-sm w-full min-w-0 ${maxError ? "input-error" : ""}`}
            placeholder={maxPlaceholder}
            value={maxValue}
            onChange={(event) => onMaxChange(event.target.value)}
            aria-label={`${label} maximum`}
            aria-invalid={maxError ? true : undefined}
          />
          {maxError ? (
            <span className="text-xs text-error">{maxError}</span>
          ) : null}
        </label>
      </div>
    </div>
  );
}

export function SearchPerformanceAdvancedFilters({
  values,
  onChange,
  onClear,
  activeFilterCount,
}: {
  values: SearchPerformanceAdvancedFilterValues;
  onChange: (values: SearchPerformanceAdvancedFilterValues) => void;
  onClear: () => void;
  activeFilterCount: number;
}) {
  const errors = getAdvancedSearchPerformanceFilterErrors(values);
  const compiledFilters = compileAdvancedSearchPerformanceFilters(values);
  const metricFiltersActive = hasActiveMetricFilters(compiledFilters);

  const update = <K extends keyof SearchPerformanceAdvancedFilterValues>(
    key: K,
    value: SearchPerformanceAdvancedFilterValues[K],
  ) => {
    onChange({ ...values, [key]: value });
  };

  return (
    <div className="space-y-3 rounded-lg border border-base-300 bg-base-200/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">Path and metric filters</div>
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 ? (
            <span className="badge badge-sm badge-primary">
              {activeFilterCount} active
            </span>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={onClear}
            disabled={
              activeFilterCount === 0 &&
              !hasAdvancedSearchPerformanceFilterErrors(values)
            }
          >
            Clear
          </button>
        </div>
      </div>
      <label className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium text-base-content/60">
          Page path prefix
        </span>
        <input
          type="text"
          className="input input-bordered input-sm w-full max-w-md"
          placeholder="/blogs/ or /blogs/*"
          value={values.pagePath}
          onChange={(event) => update("pagePath", event.target.value)}
          aria-label="Page path prefix"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricRangeField
          label="Impressions"
          minValue={values.minImpressions}
          maxValue={values.maxImpressions}
          minError={errors.minImpressions}
          maxError={errors.maxImpressions}
          onMinChange={(value) => update("minImpressions", value)}
          onMaxChange={(value) => update("maxImpressions", value)}
        />
        <MetricRangeField
          label="Clicks"
          minValue={values.minClicks}
          maxValue={values.maxClicks}
          minError={errors.minClicks}
          maxError={errors.maxClicks}
          onMinChange={(value) => update("minClicks", value)}
          onMaxChange={(value) => update("maxClicks", value)}
        />
        <MetricRangeField
          label="Avg position"
          minValue={values.minPosition}
          maxValue={values.maxPosition}
          minError={errors.minPosition}
          maxError={errors.maxPosition}
          onMinChange={(value) => update("minPosition", value)}
          onMaxChange={(value) => update("maxPosition", value)}
          inputMode="decimal"
        />
      </div>
      {metricFiltersActive ? (
        <p className="text-xs text-base-content/60">
          Tables and exports consider up to{" "}
          {SEARCH_PERFORMANCE_METRIC_FILTER_ROW_LIMIT.toLocaleString()} rows
          when metric ranges are set.
        </p>
      ) : null}
    </div>
  );
}
