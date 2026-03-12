import type { KeywordResearchControllerState } from "./types";

export function FilterTextInput({
  form,
  name,
  label,
  placeholder,
}: {
  form: KeywordResearchControllerState["filtersForm"];
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
            className="input input-bordered input-sm bg-base-100"
            placeholder={placeholder}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
          />
        )}
      </form.Field>
    </label>
  );
}

export function FilterRangeInputs({
  form,
  title,
  minName,
  maxName,
  step,
}: {
  form: KeywordResearchControllerState["filtersForm"];
  title: string;
  minName: "minVol" | "minCpc" | "minKd";
  maxName: "maxVol" | "maxCpc" | "maxKd";
  step?: string;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-2.5 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <CompactRangeInput
          form={form}
          name={minName}
          placeholder="Min"
          step={step}
        />
        <CompactRangeInput
          form={form}
          name={maxName}
          placeholder="Max"
          step={step}
        />
      </div>
    </div>
  );
}

function CompactRangeInput({
  form,
  name,
  placeholder,
  step,
}: {
  form: KeywordResearchControllerState["filtersForm"];
  name: "minVol" | "maxVol" | "minCpc" | "maxCpc" | "minKd" | "maxKd";
  placeholder: string;
  step?: string;
}) {
  return (
    <form.Field name={name}>
      {(field) => (
        <input
          className="input input-bordered input-xs bg-base-100"
          placeholder={placeholder}
          type="number"
          step={step}
          value={field.state.value}
          onChange={(event) => field.handleChange(event.target.value)}
        />
      )}
    </form.Field>
  );
}

export function EmptyFilterResults({
  activeFilterCount,
  resetFilters,
}: {
  activeFilterCount: number;
  resetFilters: () => void;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-4 text-base-content/50 gap-3">
      <p className="text-sm font-medium">
        No keywords match your current filters.
      </p>
      {activeFilterCount > 0 ? (
        <button className="btn btn-ghost btn-sm" onClick={resetFilters}>
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
