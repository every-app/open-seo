import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle } from "lucide-react";
import {
  DataTableFilterGroup,
  DataTableFilterPanel,
  DataTableRangeFilter,
} from "@/client/components/table/DataTableToolbar";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { MAX_DATAFORSEO_FILTER_CONDITIONS } from "@/types/schemas/domain";

type FilterValues = Record<string, string>;

type FilterTextField<TValues extends FilterValues> = {
  key: keyof TValues;
  label: string;
  placeholder: string;
};

type FilterRangeField<TValues extends FilterValues> = {
  title: string;
  minKey: keyof TValues;
  maxKey: keyof TValues;
  step?: string;
};

type Props<TValues extends FilterValues> = {
  activeFilterCount: number;
  appliedFilters: TValues;
  fields: ReadonlyArray<keyof TValues>;
  textFields: ReadonlyArray<FilterTextField<TValues>>;
  rangeFields: ReadonlyArray<FilterRangeField<TValues>>;
  countConditions: (values: TValues) => number;
  /** Conditions left for user filters once scope filters take their share. */
  maxConditions?: number;
  onApply: (values: TValues) => void;
  onClear: () => void;
  /** Extra feature-specific controls (toggles etc.) bound to the draft. */
  renderExtra?: (
    draft: TValues,
    setValue: (key: keyof TValues, value: string) => void,
  ) => ReactNode;
};

export function DomainFilterPanel<TValues extends FilterValues>({
  activeFilterCount,
  appliedFilters,
  fields,
  textFields,
  rangeFields,
  countConditions,
  maxConditions = MAX_DATAFORSEO_FILTER_CONDITIONS,
  onApply,
  onClear,
  renderExtra,
}: Props<TValues>) {
  const appliedKey = useMemo(
    () => fields.map((key) => appliedFilters[key]).join("|"),
    [appliedFilters, fields],
  );
  const [draftFilters, setDraftFilters] = useState(appliedFilters);
  useEffect(() => {
    setDraftFilters(appliedFilters);
    // appliedKey covers content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedKey]);

  const meta = useMemo(
    () =>
      getFilterMeta({
        values: draftFilters,
        appliedFilters,
        fields,
        countConditions,
        maxConditions,
      }),
    [appliedFilters, countConditions, draftFilters, fields, maxConditions],
  );
  const applyFilters = useCallback(() => {
    if (meta.overLimit) return;
    onApply(draftFilters);
  }, [draftFilters, meta.overLimit, onApply]);
  const cancelFilterEdits = useCallback(() => {
    setDraftFilters(appliedFilters);
  }, [appliedFilters]);
  const resetFilters = useCallback(() => {
    // Also clear unapplied draft edits — when the applied filters are already
    // empty, the applied-sync effect won't fire (appliedKey is unchanged).
    setDraftFilters((current) => {
      const next = { ...current };
      for (const key of fields) Object.assign(next, { [key]: "" });
      return next;
    });
    onClear();
  }, [fields, onClear]);
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter") return;
    // Let buttons (Cancel, toggles) handle their own Enter activation.
    if (event.target instanceof HTMLButtonElement) return;
    if (meta.overLimit) return;
    event.preventDefault();
    applyFilters();
  };
  const handleValueChange = useCallback((key: keyof TValues, value: string) => {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  }, []);

  return (
    <DataTableFilterPanel
      activeCount={activeFilterCount}
      onReset={resetFilters}
    >
      <div className="space-y-3" onKeyDown={handleKeyDown}>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {textFields.map((field) => (
            <DataTableFilterGroup key={String(field.key)} label={field.label}>
              <Input
                className="h-7"
                aria-label={field.label}
                placeholder={field.placeholder}
                value={draftFilters[field.key]}
                onChange={(event) =>
                  handleValueChange(field.key, event.target.value)
                }
              />
            </DataTableFilterGroup>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {rangeFields.map((field) => (
            <DataTableRangeFilter
              key={String(field.minKey)}
              label={field.title}
              min={{
                step: field.step,
                value: draftFilters[field.minKey],
                onChange: (event) =>
                  handleValueChange(field.minKey, event.target.value),
              }}
              max={{
                step: field.step,
                value: draftFilters[field.maxKey],
                onChange: (event) =>
                  handleValueChange(field.maxKey, event.target.value),
              }}
            />
          ))}
        </div>

        {renderExtra ? renderExtra(draftFilters, handleValueChange) : null}

        {meta.overLimit ? (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertDescription className="text-foreground">
              Too many filter conditions ({meta.conditionCount} of{" "}
              {maxConditions} max). Remove some terms or ranges before applying.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {meta.conditionCount} / {maxConditions} conditions
            </span>
            {meta.dirtyCount > 0 ? (
              <Badge size="sm" variant="warning">
                {meta.dirtyCount} unapplied
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelFilterEdits}
              disabled={!meta.isDirty}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={applyFilters}
              disabled={!meta.isDirty || meta.overLimit}
              title={
                meta.overLimit
                  ? `This scope leaves room for at most ${maxConditions} filter conditions per request`
                  : undefined
              }
            >
              Apply filters
              {meta.isDirty ? (
                <Badge size="sm" variant="secondary">
                  {meta.dirtyCount}
                </Badge>
              ) : null}
            </Button>
          </div>
        </div>
      </div>
    </DataTableFilterPanel>
  );
}

function getFilterMeta<TValues extends FilterValues>({
  values,
  appliedFilters,
  fields,
  countConditions,
  maxConditions,
}: {
  values: TValues;
  appliedFilters: TValues;
  fields: ReadonlyArray<keyof TValues>;
  countConditions: (values: TValues) => number;
  maxConditions: number;
}) {
  const conditionCount = countConditions(values);
  const dirtyCount = fields.reduce(
    (acc, key) =>
      acc + (values[key].trim() !== appliedFilters[key].trim() ? 1 : 0),
    0,
  );
  return {
    conditionCount,
    dirtyCount,
    isDirty: dirtyCount > 0,
    overLimit: conditionCount > maxConditions,
  };
}
