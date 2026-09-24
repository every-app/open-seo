import { RotateCcw } from "@/client/components/icons";
import type { CitationTab } from "@/client/features/ai-search/brandLookupFilterTypes";
import { formatPlatformLabel } from "@/client/features/ai-search/platformLabels";
import type { BrandLookupFiltersState } from "@/client/features/ai-search/useBrandLookupFilters";

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/client/components/ui/toggle-group";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyForm = { Field: React.ComponentType<any> };

function FilterTextInput({
  form,
  name,
  label,
  placeholder,
}: {
  form: AnyForm;
  name: string;
  label: string;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <form.Field name={name}>
        {(field: {
          state: { value: string };
          handleChange: (v: string) => void;
        }) => (
          <Input
            className="w-full h-8 text-sm"
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
}: {
  form: AnyForm;
  title: string;
  minName: string;
  maxName: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-2.5 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <CompactRangeInput form={form} name={minName} placeholder="Min" />
        <CompactRangeInput form={form} name={maxName} placeholder="Max" />
      </div>
    </div>
  );
}

function CompactRangeInput({
  form,
  name,
  placeholder,
}: {
  form: AnyForm;
  name: string;
  placeholder: string;
}) {
  return (
    <form.Field name={name}>
      {(field: {
        state: { value: string };
        handleChange: (v: string) => void;
      }) => (
        <Input
          className="h-8 text-sm"
          placeholder={placeholder}
          type="number"
          value={field.state.value}
          onChange={(event) => field.handleChange(event.target.value)}
        />
      )}
    </form.Field>
  );
}

function PlatformToggle({ form }: { form: AnyForm }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Platform
      </p>
      <form.Field name="platform">
        {(field: {
          state: { value: string };
          handleChange: (v: string) => void;
        }) => (
          <div className="flex flex-wrap items-center gap-1">
            <ToggleGroup
              size="sm"
              value={[field.state.value || "all"]}
              onValueChange={(next) => {
                const value = (["", "chat_gpt", "google"] as const).find(
                  (option) => (option || "all") === next[0],
                );
                if (value !== undefined) field.handleChange(value);
              }}
            >
              {(["", "chat_gpt", "google"] as const).map((value) => (
                <ToggleGroupItem key={value || "all"} value={value || "all"}>
                  {value === "" ? "All" : formatPlatformLabel(value)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}
      </form.Field>
    </div>
  );
}

function TopPagesFilters({
  form,
}: {
  form: BrandLookupFiltersState["pages"]["form"];
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <FilterTextInput
          form={form}
          name="include"
          label="Include Terms"
          placeholder="reddit, forbes"
        />
        <FilterTextInput
          form={form}
          name="exclude"
          label="Exclude Terms"
          placeholder="pinterest, /tag"
        />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <PlatformToggle form={form} />
        <div className="min-w-[220px]">
          <FilterRangeInputs
            form={form}
            title="Source mentions"
            minName="minMentions"
            maxName="maxMentions"
          />
        </div>
      </div>
    </>
  );
}

function QueriesFilters({
  form,
}: {
  form: BrandLookupFiltersState["queries"]["form"];
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <FilterTextInput
          form={form}
          name="include"
          label="Include Terms"
          placeholder="pricing, reviews"
        />
        <FilterTextInput
          form={form}
          name="exclude"
          label="Exclude Terms"
          placeholder="login, download"
        />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <PlatformToggle form={form} />
        <div className="min-w-[220px]">
          <FilterRangeInputs
            form={form}
            title="AI search volume"
            minName="minVolume"
            maxName="maxVolume"
          />
        </div>
      </div>
    </>
  );
}

export function BrandLookupFilterPanel({
  activeTab,
  filters,
}: {
  activeTab: CitationTab;
  filters: BrandLookupFiltersState;
}) {
  const current = filters[activeTab];

  return (
    <div className="shrink-0 border-b border-border bg-gradient-to-b from-card to-muted/30 px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Refine results</p>
          {current.activeFilterCount > 0 ? (
            <Badge variant="primary">{current.activeFilterCount} active</Badge>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="h-7 px-2.5 gap-1"
          onClick={current.reset}
          disabled={current.activeFilterCount === 0}
        >
          <RotateCcw className="size-3" />
          Clear all
        </Button>
      </div>

      {activeTab === "pages" ? (
        <TopPagesFilters form={filters.pages.form} />
      ) : null}
      {activeTab === "queries" ? (
        <QueriesFilters form={filters.queries.form} />
      ) : null}
    </div>
  );
}
