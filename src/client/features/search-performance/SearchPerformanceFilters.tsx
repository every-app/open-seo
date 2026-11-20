import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { DataTableFilterToggle } from "@/client/components/table/DataTableToolbar";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Spinner } from "@/client/components/ui/spinner";
import type { Report } from "@/client/features/search-performance/SearchPerformanceColumns";
import { DateRangeSelect } from "@/client/features/search-performance/SearchPerformanceSelects";
import {
  GSC_BRANDED_CLASSIFICATIONS,
  type GscBrandedClassification,
} from "@/shared/gsc";
import {
  GSC_DEVICES,
  SEARCH_PERFORMANCE_TYPES,
  type SearchPerformanceDevice,
  type SearchPerformanceSearch,
  type SearchPerformanceType,
} from "@/types/schemas/search-performance";

// Sentinel for "no filter" in the selects; never written to the URL.
const ALL = "ALL";

const TYPE_LABELS: Record<SearchPerformanceType, string> = {
  web: "Web search",
  discover: "Discover",
  googleNews: "Google News",
};
const BRAND_LABELS: Record<GscBrandedClassification, string> = {
  BRANDED: "Branded",
  NON_BRANDED: "Non-branded",
};
const DEVICE_LABELS: Record<SearchPerformanceDevice, string> = {
  DESKTOP: "Desktop",
  MOBILE: "Mobile",
  TABLET: "Tablet",
};
const TYPE_ITEMS = SEARCH_PERFORMANCE_TYPES.map((value) => ({
  value,
  label: TYPE_LABELS[value],
}));
const BRAND_ITEMS = [
  { value: ALL, label: "All queries" },
  ...GSC_BRANDED_CLASSIFICATIONS.map((value) => ({
    value,
    label: BRAND_LABELS[value],
  })),
];
const DEVICE_ITEMS = [
  { value: ALL, label: "All devices" },
  ...GSC_DEVICES.map((value) => ({ value, label: DEVICE_LABELS[value] })),
];

function FilterSelect({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          if (next != null) onChange(next);
        }}
      >
        <SelectTrigger size="sm" className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * The Filters toggle and date range above the report, and the panel of
 * page-wide filters the toggle opens. Each choice applies right away.
 * Discover and Google News have no queries to split by brand, and Google
 * rejects a device filter on Discover.
 */
export function SearchPerformanceFilterBar({
  search,
  report,
  isFetching,
  defaultOpen,
  onSearchChange,
}: {
  search: SearchPerformanceSearch;
  /** The loaded report, for the country options and the brand split. */
  report: Report | undefined;
  isFetching: boolean;
  defaultOpen: boolean;
  onSearchChange: (update: Partial<SearchPerformanceSearch>) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const type = search.type ?? "web";
  const isWeb = type === "web";
  const device = type === "discover" ? undefined : search.device;
  const brand = isWeb && !search.queryText ? search.brand : undefined;
  const countries = report?.countries ?? [];
  // Google doesn't split this property's queries by brand.
  const brandUnavailable =
    report?.brandClassified === false && report.totals.impressions > 0;
  const activeCount =
    Number(!isWeb) +
    Number(Boolean(device)) +
    Number(Boolean(search.country)) +
    Number(Boolean(brand));
  const countryItems = [
    { value: ALL, label: "All countries" },
    ...(search.country && !countries.some((row) => row.key === search.country)
      ? [{ value: search.country, label: search.country.toUpperCase() }]
      : []),
    ...countries.map((row) => ({
      value: row.key,
      label: row.key.toUpperCase(),
    })),
  ];
  const apply = (update: Partial<SearchPerformanceSearch>) =>
    onSearchChange({ page: undefined, ...update });
  // Another search type has other tabs, and only web has queries.
  const applyType = (next: SearchPerformanceType) =>
    apply({
      type: next === "web" ? undefined : next,
      tab: undefined,
      ...(next === "web"
        ? {}
        : { brand: undefined, queryText: undefined, queryMatch: undefined }),
      ...(next === "discover" ? { device: undefined } : {}),
    });

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <DataTableFilterToggle
          open={open}
          activeCount={activeCount}
          onToggle={() => setOpen((current) => !current)}
        />
        <DateRangeSelect
          value={search.range ?? "last_28_days"}
          onChange={(range) => apply({ range })}
          triggerClassName="w-36"
        />
        {isFetching ? (
          <Spinner className="size-4 text-muted-foreground" />
        ) : null}
      </div>
      {open ? (
        <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Refine results</p>
              {activeCount > 0 ? (
                <Badge size="sm">{activeCount} active</Badge>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="xs"
              disabled={activeCount === 0}
              onClick={() =>
                apply({
                  type: undefined,
                  tab: isWeb ? search.tab : undefined,
                  device: undefined,
                  country: undefined,
                  brand: undefined,
                })
              }
            >
              <RotateCcw data-icon="inline-start" />
              Clear all
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterSelect
              label="Search type"
              items={TYPE_ITEMS}
              value={type}
              onChange={(value) => {
                const next = SEARCH_PERFORMANCE_TYPES.find((t) => t === value);
                if (next && next !== type) applyType(next);
              }}
            />
            {type === "discover" ? null : (
              <FilterSelect
                label="Device"
                items={DEVICE_ITEMS}
                value={device ?? ALL}
                onChange={(value) =>
                  apply({ device: GSC_DEVICES.find((d) => d === value) })
                }
              />
            )}
            <FilterSelect
              label="Country"
              items={countryItems}
              value={search.country ?? ALL}
              onChange={(value) =>
                apply({ country: value === ALL ? undefined : value })
              }
            />
            {/* Hidden where Google doesn't split the property's queries,
                unless a brand from the URL still needs clearing. */}
            {isWeb && (brand || !brandUnavailable) ? (
              <FilterSelect
                label="Branded"
                items={BRAND_ITEMS}
                value={brand ?? ALL}
                onChange={(value) => {
                  const next = GSC_BRANDED_CLASSIFICATIONS.find(
                    (b) => b === value,
                  );
                  // Google can't combine the brand split with a query filter.
                  apply(
                    next
                      ? {
                          brand: next,
                          queryText: undefined,
                          queryMatch: undefined,
                        }
                      : { brand: undefined },
                  );
                }}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
