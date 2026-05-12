import { Minus, Plus, RotateCcw, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import type { SavedKeywordsFilterValues } from "./savedKeywordsFilterTypes";
import type { SavedKeywordsFilterForm } from "./useSavedKeywordsFilters";

export function SavedKeywordsFilterPanel({
  form,
  activeFilterCount,
  onReset,
}: {
  form: SavedKeywordsFilterForm;
  activeFilterCount: number;
  onReset: () => void;
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

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <TermsTokenInput
          form={form}
          name="include"
          label="Include"
          variant="include"
          placeholder="Must contain… e.g. audit"
        />
        <TermsTokenInput
          form={form}
          name="exclude"
          label="Exclude"
          variant="exclude"
          placeholder="Must not contain… e.g. jobs"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <FilterRangeInputs
          form={form}
          title="Search Volume"
          minName="minVol"
          maxName="maxVol"
          min={0}
        />
        <FilterRangeInputs
          form={form}
          title="CPC (USD)"
          minName="minCpc"
          maxName="maxCpc"
          step="0.01"
          min={0}
        />
        <FilterRangeInputs
          form={form}
          title="Difficulty"
          minName="minKd"
          maxName="maxKd"
          min={0}
          max={100}
        />
      </div>
    </div>
  );
}

type TermsVariant = "include" | "exclude";

const VARIANT_STYLES: Record<
  TermsVariant,
  { icon: typeof Plus; chip: string; iconBg: string }
> = {
  include: {
    icon: Plus,
    chip: "tag-chip-emerald ring-1 ring-inset",
    iconBg: "tag-chip-emerald ring-1 ring-inset",
  },
  exclude: {
    icon: Minus,
    chip: "tag-chip-rose ring-1 ring-inset",
    iconBg: "tag-chip-rose ring-1 ring-inset",
  },
};

function splitTerms(value: string): string[] {
  return value
    .split(/[,+]/)
    .map((term) => term.trim())
    .filter(Boolean);
}

function joinTerms(terms: string[]): string {
  return terms.join(", ");
}

function TermsTokenInput({
  form,
  name,
  label,
  variant,
  placeholder,
}: {
  form: SavedKeywordsFilterForm;
  name: "include" | "exclude";
  label: string;
  variant: TermsVariant;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const styles = VARIANT_STYLES[variant];
  const Icon = styles.icon;

  return (
    <div className="space-y-2 rounded-lg border border-base-300 bg-base-100 p-2.5">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex size-4 items-center justify-center rounded ${styles.iconBg}`}
        >
          <Icon className="size-2.5" />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
          {label}
        </p>
      </div>
      <form.Field name={name}>
        {(field) => {
          const terms = splitTerms(field.state.value);
          const commit = (next: string[]) => {
            field.handleChange(joinTerms([...new Set(next)]));
          };
          const addFromDraft = () => {
            const parsed = splitTerms(draft);
            if (parsed.length > 0) {
              commit([...terms, ...parsed]);
              setDraft("");
            }
          };
          const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addFromDraft();
            } else if (
              event.key === "Backspace" &&
              draft.length === 0 &&
              terms.length > 0
            ) {
              commit(terms.slice(0, -1));
            }
          };
          return (
            <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-base-300 bg-base-200/30 px-2 py-1.5 focus-within:border-primary">
              {terms.map((term) => (
                <span
                  key={term}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${styles.chip}`}
                >
                  {term}
                  <button
                    type="button"
                    className="opacity-70 hover:opacity-100"
                    aria-label={`Remove ${term}`}
                    onClick={() =>
                      commit(terms.filter((existing) => existing !== term))
                    }
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={addFromDraft}
                placeholder={terms.length === 0 ? placeholder : ""}
                className="min-w-[6rem] flex-1 bg-transparent text-xs outline-none placeholder:text-base-content/40"
              />
            </div>
          );
        }}
      </form.Field>
    </div>
  );
}

type RangeFieldName = Extract<
  keyof SavedKeywordsFilterValues,
  "minVol" | "maxVol" | "minCpc" | "maxCpc" | "minKd" | "maxKd"
>;

function FilterRangeInputs({
  form,
  title,
  minName,
  maxName,
  step,
  min,
  max,
}: {
  form: SavedKeywordsFilterForm;
  title: string;
  minName: Extract<RangeFieldName, "minVol" | "minCpc" | "minKd">;
  maxName: Extract<RangeFieldName, "maxVol" | "maxCpc" | "maxKd">;
  step?: string;
  min?: number;
  max?: number;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-base-300 bg-base-100 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <CompactRangeInput
          form={form}
          name={minName}
          placeholder="Min"
          step={step}
          min={min}
          max={max}
        />
        <CompactRangeInput
          form={form}
          name={maxName}
          placeholder="Max"
          step={step}
          min={min}
          max={max}
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
  min,
  max,
}: {
  form: SavedKeywordsFilterForm;
  name: RangeFieldName;
  placeholder: string;
  step?: string;
  min?: number;
  max?: number;
}) {
  return (
    <form.Field name={name}>
      {(field) => (
        <input
          className="input input-bordered input-xs bg-base-100"
          placeholder={placeholder}
          type="number"
          step={step}
          min={min}
          max={max}
          value={field.state.value}
          onChange={(event) => field.handleChange(event.target.value)}
        />
      )}
    </form.Field>
  );
}
