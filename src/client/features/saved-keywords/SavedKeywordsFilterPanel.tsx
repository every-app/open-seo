import { Minus, Plus, X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import {
  DataTableFilterGroup,
  DataTableFilterPanel,
  DataTableRangeFilter,
} from "@/client/components/table/DataTableToolbar";
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
    <DataTableFilterPanel activeCount={activeFilterCount} onReset={onReset}>
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
    </DataTableFilterPanel>
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
    <DataTableFilterGroup
      label={label}
      icon={
        <span
          className={`inline-flex size-4 items-center justify-center rounded ${styles.iconBg}`}
        >
          <Icon className="size-2.5" />
        </span>
      }
    >
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
            <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:border-ring">
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
                // data-slot opts out of the global 16px input rule, so the
                // text matches the shadcn inputs: 16px on phones, 14px from md.
                data-slot="input"
                className="min-w-[6rem] flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
              />
            </div>
          );
        }}
      </form.Field>
    </DataTableFilterGroup>
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
  const limits = { step, min, max };
  return (
    <form.Field name={minName}>
      {(minField) => (
        <form.Field name={maxName}>
          {(maxField) => (
            <DataTableRangeFilter
              label={title}
              min={{
                ...limits,
                value: minField.state.value,
                onChange: (event) => minField.handleChange(event.target.value),
              }}
              max={{
                ...limits,
                value: maxField.state.value,
                onChange: (event) => maxField.handleChange(event.target.value),
              }}
            />
          )}
        </form.Field>
      )}
    </form.Field>
  );
}
