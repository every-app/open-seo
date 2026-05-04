import { AlertTriangle, RotateCcw } from "lucide-react";
import type { useDomainFilters } from "@/client/features/domain/hooks/useDomainFilters";
import type { DomainFilterValues } from "@/client/features/domain/types";
import { MAX_DATAFORSEO_FILTER_CONDITIONS } from "@/types/schemas/domain";

type FilterForm = ReturnType<typeof useDomainFilters>["filtersForm"];

type Props = {
  filtersForm: FilterForm;
  activeFilterCount: number;
  dirtyFilterCount: number;
  conditionCount: number;
  overLimit: boolean;
  resetFilters: () => void;
  applyFilters: () => void;
  cancelFilterEdits: () => void;
};

export function DomainFilterPanel({
  filtersForm,
  activeFilterCount,
  dirtyFilterCount,
  conditionCount,
  overLimit,
  resetFilters,
  applyFilters,
  cancelFilterEdits,
}: Props) {
  const isDirty = dirtyFilterCount > 0;
  const canApply = isDirty && !overLimit;
  const handleApplyKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && canApply) {
      event.preventDefault();
      applyFilters();
    }
  };

  return (
    <div
      className="border-b border-base-300 bg-gradient-to-b from-base-100 to-base-200/30 px-4 py-3 space-y-3"
      onKeyDown={handleApplyKeyDown}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Refine table results</p>
          {activeFilterCount > 0 ? (
            <span className="badge badge-xs badge-primary border-0 text-primary-content">
              {activeFilterCount} active
            </span>
          ) : null}
          {isDirty ? (
            <span className="badge badge-xs badge-warning border-0">
              {dirtyFilterCount} unapplied
            </span>
          ) : null}
        </div>
        <button
          className="btn btn-xs btn-ghost gap-1"
          onClick={resetFilters}
          disabled={activeFilterCount === 0 && !isDirty}
        >
          <RotateCcw className="size-3" />
          Clear all
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <FilterTextInput
          form={filtersForm}
          name="include"
          label="Include Terms"
          placeholder="audit, checker, template"
        />
        <FilterTextInput
          form={filtersForm}
          name="exclude"
          label="Exclude Terms"
          placeholder="jobs, salary, course"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <FilterRangeInputs
          form={filtersForm}
          title="Traffic"
          minName="minTraffic"
          maxName="maxTraffic"
        />
        <FilterRangeInputs
          form={filtersForm}
          title="Volume"
          minName="minVol"
          maxName="maxVol"
        />
        <FilterRangeInputs
          form={filtersForm}
          title="CPC (USD)"
          minName="minCpc"
          maxName="maxCpc"
          step="0.01"
        />
        <FilterRangeInputs
          form={filtersForm}
          title="Score (KD)"
          minName="minKd"
          maxName="maxKd"
        />
        <FilterRangeInputs
          form={filtersForm}
          title="Rank"
          minName="minRank"
          maxName="maxRank"
        />
      </div>

      {overLimit ? (
        <div className="alert alert-warning py-2 text-xs">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            Too many filter conditions ({conditionCount} of{" "}
            {MAX_DATAFORSEO_FILTER_CONDITIONS} max). Remove some terms or ranges
            before applying.
          </span>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-base-content/50 tabular-nums">
          {conditionCount} / {MAX_DATAFORSEO_FILTER_CONDITIONS} conditions
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={cancelFilterEdits}
            disabled={!isDirty}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={applyFilters}
            disabled={!canApply}
            title={
              overLimit
                ? `DataForSEO accepts at most ${MAX_DATAFORSEO_FILTER_CONDITIONS} filter conditions per request`
                : undefined
            }
          >
            Apply filters
            {isDirty ? (
              <span className="badge badge-xs ml-1 border-0 bg-primary-content/20">
                {dirtyFilterCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterTextInput({
  form,
  name,
  label,
  placeholder,
}: {
  form: FilterForm;
  name: "include" | "exclude";
  label: string;
  placeholder: string;
}) {
  return (
    <label className="form-control gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
        {label}
      </span>
      <form.Field name={name}>
        {(field) => (
          <input
            className="input input-bordered input-sm w-full bg-base-100"
            placeholder={placeholder}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
    </label>
  );
}

function FilterRangeInputs({
  form,
  title,
  minName,
  maxName,
  step,
}: {
  form: FilterForm;
  title: string;
  minName: keyof DomainFilterValues;
  maxName: keyof DomainFilterValues;
  step?: string;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-2.5 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <form.Field name={minName}>
          {(field) => (
            <input
              className="input input-bordered input-xs bg-base-100"
              placeholder="Min"
              type="number"
              step={step}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          )}
        </form.Field>
        <form.Field name={maxName}>
          {(field) => (
            <input
              className="input input-bordered input-xs bg-base-100"
              placeholder="Max"
              type="number"
              step={step}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          )}
        </form.Field>
      </div>
    </div>
  );
}
