import {
  KEYWORD_INTENT_ORDER,
  parseIntentFilter,
  toggleIntentFilter,
} from "@/client/features/keywords/keywordResearchTypes";
import { INTENT_LABELS } from "@/client/features/keywords/components/IntentBadge";
import type { KeywordResearchControllerState } from "./types";

import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Toggle } from "@/client/components/ui/toggle";
export function FilterIntentSelect({
  form,
}: {
  form: KeywordResearchControllerState["filtersForm"];
}) {
  return (
    <div
      role="group"
      aria-labelledby="keyword-intent-filter-label"
      className="rounded-lg border border-border bg-card p-2.5 space-y-2"
    >
      <p
        id="keyword-intent-filter-label"
        className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        Intent
      </p>
      <form.Field name="intents">
        {(field) => {
          const selected = parseIntentFilter(field.state.value);
          return (
            <div className="flex flex-wrap gap-1.5">
              {KEYWORD_INTENT_ORDER.map((intent) => {
                const isActive = selected.includes(intent);
                return (
                  <Toggle
                    key={intent}
                    size="sm"
                    variant="outline"
                    pressed={isActive}
                    onPressedChange={() =>
                      field.handleChange(
                        toggleIntentFilter(field.state.value, intent),
                      )
                    }
                  >
                    {INTENT_LABELS[intent]}
                  </Toggle>
                );
              })}
            </div>
          );
        }}
      </form.Field>
    </div>
  );
}

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
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <form.Field name={name}>
        {(field) => (
          <Input
            className="bg-card h-8 text-sm"
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
    <div className="rounded-lg border border-border bg-card p-2.5 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
        <Input
          className="bg-card h-7 text-xs"
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
    <div className="h-full flex flex-col items-center justify-center text-center px-4 text-muted-foreground/70 gap-3">
      <p className="text-sm font-medium">
        No keywords match your current filters.
      </p>
      {activeFilterCount > 0 ? (
        <Button variant="ghost" size="sm" onClick={resetFilters}>
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
