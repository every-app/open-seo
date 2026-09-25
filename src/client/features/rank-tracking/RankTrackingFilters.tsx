import { RotateCcw } from "@/client/components/icons";
import type { DomainListFilters, Filters } from "./RankTrackingFilters.logic";

import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Card } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { NativeSelect } from "@/client/components/ui/native-select";
export * from "./RankTrackingFilters.logic";

type DomainListFilterOption = {
  value: string;
  label: string;
};

export function FilterPanel({
  filters,
  setFilters,
  activeFilterCount,
  onReset,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  activeFilterCount: number;
  onReset: () => void;
}) {
  const update = (key: keyof Filters, value: string) =>
    setFilters({ ...filters, [key]: value });

  return (
    <div className="shrink-0 border-b border-border bg-gradient-to-b from-card to-muted/30 px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Refine results</p>
          {activeFilterCount > 0 && (
            <Badge variant="primary">{activeFilterCount} active</Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2.5 gap-1"
          onClick={onReset}
          disabled={activeFilterCount === 0}
        >
          <RotateCcw className="size-3" />
          Clear all
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="space-y-1.5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Include
          </p>
          <Input
            className="w-full h-8 text-sm"
            placeholder="e.g. seo, tool"
            value={filters.include}
            onChange={(e) => update("include", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Exclude
          </p>
          <Input
            className="w-full h-8 text-sm"
            placeholder="e.g. free, cheap"
            value={filters.exclude}
            onChange={(e) => update("exclude", e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <RangeFilter
          title="Desktop position"
          minValue={filters.minDesktopPos}
          maxValue={filters.maxDesktopPos}
          onMinChange={(v) => update("minDesktopPos", v)}
          onMaxChange={(v) => update("maxDesktopPos", v)}
        />
        <RangeFilter
          title="Mobile position"
          minValue={filters.minMobilePos}
          maxValue={filters.maxMobilePos}
          onMinChange={(v) => update("minMobilePos", v)}
          onMaxChange={(v) => update("maxMobilePos", v)}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <RangeFilter
          title="Volume"
          minValue={filters.minVolume}
          maxValue={filters.maxVolume}
          onMinChange={(v) => update("minVolume", v)}
          onMaxChange={(v) => update("maxVolume", v)}
        />
        <RangeFilter
          title="Keyword difficulty"
          minValue={filters.minKd}
          maxValue={filters.maxKd}
          onMinChange={(v) => update("minKd", v)}
          onMaxChange={(v) => update("maxKd", v)}
        />
        <RangeFilter
          title="CPC"
          minValue={filters.minCpc}
          maxValue={filters.maxCpc}
          onMinChange={(v) => update("minCpc", v)}
          onMaxChange={(v) => update("maxCpc", v)}
        />
      </div>
    </div>
  );
}

export function DomainListFilterBar({
  filters,
  options,
  activeFilterCount,
  onChange,
  onReset,
}: {
  filters: DomainListFilters;
  options: {
    devices: DomainListFilterOption[];
    locations: DomainListFilterOption[];
  };
  activeFilterCount: number;
  onChange: (filters: DomainListFilters) => void;
  onReset: () => void;
}) {
  return (
    <div className="border-t border-border px-5 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Search
          </span>
          <Input
            className="w-full h-8 text-sm"
            placeholder="Domain or website"
            value={filters.query}
            onChange={(event) =>
              onChange({ ...filters, query: event.target.value })
            }
          />
        </label>
        <label className="flex flex-col gap-1.5 lg:w-44">
          <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Device
          </span>
          <NativeSelect
            className="w-full h-8 text-sm"
            value={filters.device}
            onChange={(event) => {
              const value = event.target.value;
              if (
                value === "all" ||
                value === "both" ||
                value === "desktop" ||
                value === "mobile"
              ) {
                onChange({ ...filters, device: value });
              }
            }}
          >
            <option value="all">All devices</option>
            {options.devices.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1.5 lg:w-52">
          <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
            Country
          </span>
          <NativeSelect
            className="w-full h-8 text-sm"
            value={filters.locationCode}
            onChange={(event) =>
              onChange({ ...filters, locationCode: event.target.value })
            }
          >
            <option value="all">All countries</option>
            {options.locations.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </label>
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 self-start lg:self-auto"
            onClick={onReset}
          >
            <RotateCcw className="size-3" />
            Clear
            <Badge variant="primary">{activeFilterCount}</Badge>
          </Button>
        )}
      </div>
    </div>
  );
}

function RangeFilter({
  title,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
}: {
  title: string;
  minValue: string;
  maxValue: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
}) {
  return (
    <Card className="space-y-2 p-2.5">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Input
          className="h-7 text-xs"
          placeholder="Min"
          type="number"
          value={minValue}
          onChange={(e) => onMinChange(e.target.value)}
        />
        <Input
          className="h-7 text-xs"
          placeholder="Max"
          type="number"
          value={maxValue}
          onChange={(e) => onMaxChange(e.target.value)}
        />
      </div>
    </Card>
  );
}
