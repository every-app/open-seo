import { useId } from "react";
import { RotateCcw } from "lucide-react";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import type { DomainListFilters, Filters } from "./RankTrackingFilters.logic";

export * from "./RankTrackingFilters.logic";

type DomainListFilterOption = {
  value: string;
  label: string;
};

const FILTER_LABEL_CLASS =
  "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

/** `draft` is the unapplied panel state; it reaches the URL after a pause. */
export function FilterPanel({
  draft,
  setDraft,
  activeFilterCount,
  onReset,
}: {
  draft: Filters;
  setDraft: (f: Filters) => void;
  activeFilterCount: number;
  onReset: () => void;
}) {
  const id = useId();
  const update = (key: keyof Filters, value: string) =>
    setDraft({ ...draft, [key]: value });

  return (
    <div className="shrink-0 space-y-3 border-b border-border bg-muted/40 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Refine results</p>
          {activeFilterCount > 0 && (
            <Badge size="sm">{activeFilterCount} active</Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="xs"
          onClick={onReset}
          disabled={activeFilterCount === 0}
        >
          <RotateCcw data-icon="inline-start" />
          Clear all
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-include`} className={FILTER_LABEL_CLASS}>
            Include
          </Label>
          <Input
            id={`${id}-include`}
            placeholder="e.g. seo, tool"
            value={draft.include}
            onChange={(e) => update("include", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-exclude`} className={FILTER_LABEL_CLASS}>
            Exclude
          </Label>
          <Input
            id={`${id}-exclude`}
            placeholder="e.g. free, cheap"
            value={draft.exclude}
            onChange={(e) => update("exclude", e.target.value)}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <RangeFilter
          title="Desktop position"
          minValue={draft.minDesktopPos}
          maxValue={draft.maxDesktopPos}
          onMinChange={(v) => update("minDesktopPos", v)}
          onMaxChange={(v) => update("maxDesktopPos", v)}
        />
        <RangeFilter
          title="Mobile position"
          minValue={draft.minMobilePos}
          maxValue={draft.maxMobilePos}
          onMinChange={(v) => update("minMobilePos", v)}
          onMaxChange={(v) => update("maxMobilePos", v)}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <RangeFilter
          title="Volume"
          minValue={draft.minVolume}
          maxValue={draft.maxVolume}
          onMinChange={(v) => update("minVolume", v)}
          onMaxChange={(v) => update("maxVolume", v)}
        />
        <RangeFilter
          title="Keyword difficulty"
          minValue={draft.minKd}
          maxValue={draft.maxKd}
          onMinChange={(v) => update("minKd", v)}
          onMaxChange={(v) => update("maxKd", v)}
        />
        <RangeFilter
          title="CPC"
          minValue={draft.minCpc}
          maxValue={draft.maxCpc}
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
  const id = useId();
  const deviceItems = [
    { value: "all", label: "All devices" },
    ...options.devices,
  ];
  const locationItems = [
    { value: "all", label: "All countries" },
    ...options.locations,
  ];

  return (
    <div className="border-t border-border px-5 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={`${id}-search`} className={FILTER_LABEL_CLASS}>
            Search
          </Label>
          <Input
            id={`${id}-search`}
            placeholder="Domain or website"
            value={filters.query}
            onChange={(event) =>
              onChange({ ...filters, query: event.target.value })
            }
          />
        </div>
        <div className="flex flex-col gap-1.5 lg:w-44">
          <Label htmlFor={`${id}-device`} className={FILTER_LABEL_CLASS}>
            Device
          </Label>
          <Select
            items={deviceItems}
            value={filters.device}
            onValueChange={(value) => {
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
            <SelectTrigger id={`${id}-device`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {deviceItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 lg:w-52">
          <Label htmlFor={`${id}-country`} className={FILTER_LABEL_CLASS}>
            Country
          </Label>
          <Select
            items={locationItems}
            value={filters.locationCode}
            onValueChange={(value) => {
              if (value) onChange({ ...filters, locationCode: value });
            }}
          >
            <SelectTrigger id={`${id}-country`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locationItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            className="self-start lg:self-auto"
            onClick={onReset}
          >
            <RotateCcw data-icon="inline-start" />
            Clear
            <Badge size="sm">{activeFilterCount}</Badge>
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
    <div className="space-y-2 rounded-lg border border-border bg-card p-2.5">
      <p className={FILTER_LABEL_CLASS}>{title}</p>
      <div className="grid grid-cols-2 gap-2">
        <Input
          className="h-7"
          placeholder="Min"
          aria-label={`${title} min`}
          type="number"
          value={minValue}
          onChange={(e) => onMinChange(e.target.value)}
        />
        <Input
          className="h-7"
          placeholder="Max"
          aria-label={`${title} max`}
          type="number"
          value={maxValue}
          onChange={(e) => onMaxChange(e.target.value)}
        />
      </div>
    </div>
  );
}
