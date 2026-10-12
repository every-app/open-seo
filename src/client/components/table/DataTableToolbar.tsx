import { RotateCcw, SlidersHorizontal } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Tabs, TabsList } from "@/client/components/ui/tabs";

// The parts above a `DataTable`: a tab row, a toolbar row and a collapsible
// filter panel. The page owns the filter values and the open state.

/**
 * Tabs that switch what the table shows, as the first row of its card. Pass
 * `TabsTrigger`s as children and actions such as `ExportMenu` in `actions`.
 */
export function DataTableTabs({
  value,
  onValueChange,
  actions,
  description,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  actions?: ReactNode;
  /** A short note about the active tab, under the tabs. */
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 border-b border-border px-4 pt-3 pb-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={value} onValueChange={onValueChange}>
          <TabsList
            variant="line"
            className="h-auto! flex-wrap justify-start *:flex-none"
          >
            {children}
          </TabsList>
        </Tabs>
        {actions}
      </div>
      {description ? (
        <div className="text-sm text-muted-foreground">{description}</div>
      ) : null}
    </div>
  );
}

/** Filter controls on the left, actions such as `ExportMenu` on the right. */
export function DataTableToolbar({
  children,
  actions,
}: {
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

export function DataTableFilterToggle({
  open,
  activeCount,
  onToggle,
}: {
  open: boolean;
  activeCount: number;
  onToggle: () => void;
}) {
  return (
    <Button variant="outline" size="sm" aria-expanded={open} onClick={onToggle}>
      <SlidersHorizontal data-icon="inline-start" />
      Filters
      {activeCount > 0 ? (
        <Badge size="sm" aria-label={`${activeCount} active`}>
          {activeCount}
        </Badge>
      ) : null}
    </Button>
  );
}

export function DataTableFilterPanel({
  activeCount,
  onReset,
  children,
}: {
  activeCount: number;
  onReset: () => void;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 border-b border-border bg-foreground/[0.02] px-4 py-3">
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
          onClick={onReset}
          disabled={activeCount === 0}
        >
          <RotateCcw data-icon="inline-start" />
          Clear all
        </Button>
      </div>
      {children}
    </div>
  );
}

/** A labelled box for one filter, for example a Min/Max range. */
export function DataTableFilterGroup({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-2.5">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
      </div>
      {children}
    </div>
  );
}

/** A Min/Max range filter. Bind each input to a form field. */
export function DataTableRangeFilter({
  label,
  min,
  max,
}: {
  label: string;
  min: ComponentProps<typeof Input>;
  max: ComponentProps<typeof Input>;
}) {
  return (
    <DataTableFilterGroup label={label}>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          placeholder="Min"
          aria-label={`${label} min`}
          className="h-7"
          {...min}
        />
        <Input
          type="number"
          placeholder="Max"
          aria-label={`${label} max`}
          className="h-7"
          {...max}
        />
      </div>
    </DataTableFilterGroup>
  );
}
