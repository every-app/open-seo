import { Minus, Plus, RotateCcw, X } from "@/client/components/icons";
import { useState, type KeyboardEvent } from "react";
import type { SavedKeywordsFilterValues } from "./savedKeywordsFilterTypes";
import type { SavedKeywordsFilterForm } from "./useSavedKeywordsFilters";

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";

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
    <div className="space-y-3 border-b border-border bg-gradient-to-b from-card to-muted/30 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Refine results</p>
          {activeFilterCount > 0 ? (
            <Badge variant="primary">{activeFilterCount} active</Badge>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="h-7 px-2.5 gap-1"
          onClick={onReset}
          disabled={activeFilterCount === 0}
        >
          <RotateCcw className="size-3" />
          Clear all
        </Button>
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
    <Card className="space-y-2 p-2.5">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex size-4 items-center justify-center rounded ${styles.iconBg}`}
        >
          <Icon className="size-2.5" />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
            <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5 focus-within:border-primary">
              {terms.map((term) => (
                <span
                  key={term}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${styles.chip}`}
                >
                  {term}
                  <Button
                    variant="ghost"
                    className="h-auto rounded-md text-inherit px-0 hover:bg-transparent opacity-70 hover:opacity-100"
                    aria-label={`Remove ${term}`}
                    onClick={() =>
                      commit(terms.filter((existing) => existing !== term))
                    }
                  >
                    <X className="size-3" />
                  </Button>
                </span>
              ))}
              <Input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={addFromDraft}
                placeholder={terms.length === 0 ? placeholder : ""}
                className="h-7 w-auto min-w-[6rem] flex-1 rounded-none border-0 bg-transparent px-1 text-xs shadow-none hover:bg-transparent focus-visible:shadow-none"
              />
            </div>
          );
        }}
      </form.Field>
    </Card>
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
    <Card className="space-y-2 p-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
    </Card>
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
        <Input
          className="h-7 text-xs"
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
