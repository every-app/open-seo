import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import {
  FilterNumberInput,
  FilterRangeGroup,
  FilterTextInput,
} from "@/client/features/domain/components/DomainFilterFields";
import {
  debugDomain,
  useDomainRenderDebug,
} from "@/client/features/domain/domainDebug";
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
  debugName: string;
  activeFilterCount: number;
  appliedFilters: TValues;
  fields: ReadonlyArray<keyof TValues>;
  textFields: ReadonlyArray<FilterTextField<TValues>>;
  rangeFields: ReadonlyArray<FilterRangeField<TValues>>;
  countConditions: (values: TValues) => number;
  onApply: (values: TValues) => void;
  onClear: () => void;
  /** Extra feature-specific controls (toggles etc.) bound to the draft. */
  renderExtra?: (
    draft: TValues,
    setValue: (key: keyof TValues, value: string) => void,
  ) => ReactNode;
};

export function DomainFilterPanel<TValues extends FilterValues>({
  debugName,
  activeFilterCount,
  appliedFilters,
  fields,
  textFields,
  rangeFields,
  countConditions,
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
      }),
    [appliedFilters, countConditions, draftFilters, fields],
  );
  useDomainRenderDebug(debugName, {
    activeFilterCount,
    conditionCount: meta.conditionCount,
    dirtyCount: meta.dirtyCount,
  });
  const applyFilters = useCallback(() => {
    if (meta.overLimit) return;
    debugDomain(`${debugName}:apply`, {
      conditionCount: meta.conditionCount,
      dirtyCount: meta.dirtyCount,
      draftFilters,
    });
    onApply(draftFilters);
  }, [
    debugName,
    draftFilters,
    meta.conditionCount,
    meta.dirtyCount,
    meta.overLimit,
    onApply,
  ]);
  const cancelFilterEdits = useCallback(() => {
    debugDomain(`${debugName}:cancel`);
    setDraftFilters(appliedFilters);
  }, [appliedFilters, debugName]);
  const resetFilters = useCallback(() => {
    debugDomain(`${debugName}:clear`);
    // Also clear unapplied draft edits — when the applied filters are already
    // empty, the applied-sync effect won't fire (appliedKey is unchanged).
    setDraftFilters((current) => {
      const next = { ...current };
      for (const key of fields) Object.assign(next, { [key]: "" });
      return next;
    });
    onClear();
  }, [debugName, fields, onClear]);
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "Enter") return;
    // Let buttons (Cancel, toggles) handle their own Enter activation.
    if (event.target instanceof HTMLButtonElement) return;
    if (meta.overLimit) return;
    event.preventDefault();
    applyFilters();
  };
  const handleValueChange = useCallback(
    (key: keyof TValues, value: string) => {
      debugDomain(`${debugName}:draft-change`, {
        field: String(key),
        valueLength: value.length,
      });
      setDraftFilters((current) => ({ ...current, [key]: value }));
    },
    [debugName],
  );

  return (
    <div
      className="border-b border-base-300 bg-gradient-to-b from-base-100 to-base-200/30 px-4 py-3 space-y-3"
      onKeyDown={handleKeyDown}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Refine table results</p>
          {activeFilterCount > 0 ? (
            <span className="badge badge-xs badge-primary border-0 text-primary-content">
              {activeFilterCount} active
            </span>
          ) : null}
          {meta.dirtyCount > 0 ? (
            <span className="badge badge-xs badge-warning border-0">
              {meta.dirtyCount} unapplied
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-xs btn-ghost gap-1"
          onClick={resetFilters}
          disabled={activeFilterCount === 0 && !meta.isDirty}
        >
          <RotateCcw className="size-3" />
          Clear all
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {textFields.map((field) => (
          <FilterTextInput
            key={String(field.key)}
            label={field.label}
            placeholder={field.placeholder}
            value={draftFilters[field.key]}
            onChange={(value) => handleValueChange(field.key, value)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {rangeFields.map((field) => (
          <FilterRangeGroup key={String(field.minKey)} title={field.title}>
            <FilterNumberInput
              value={draftFilters[field.minKey]}
              onChange={(value) => handleValueChange(field.minKey, value)}
              placeholder="Min"
              step={field.step}
            />
            <FilterNumberInput
              value={draftFilters[field.maxKey]}
              onChange={(value) => handleValueChange(field.maxKey, value)}
              placeholder="Max"
              step={field.step}
            />
          </FilterRangeGroup>
        ))}
      </div>

      {renderExtra ? renderExtra(draftFilters, handleValueChange) : null}

      {meta.overLimit ? (
        <div className="alert alert-warning py-2 text-xs">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            Too many filter conditions ({meta.conditionCount} of{" "}
            {MAX_DATAFORSEO_FILTER_CONDITIONS} max). Remove some terms or ranges
            before applying.
          </span>
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-base-content/50 tabular-nums">
          {meta.conditionCount} / {MAX_DATAFORSEO_FILTER_CONDITIONS} conditions
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={cancelFilterEdits}
            disabled={!meta.isDirty}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={applyFilters}
            disabled={!meta.isDirty || meta.overLimit}
            title={
              meta.overLimit
                ? `DataForSEO accepts at most ${MAX_DATAFORSEO_FILTER_CONDITIONS} filter conditions per request`
                : undefined
            }
          >
            Apply filters
            {meta.isDirty ? (
              <span className="badge badge-xs ml-1 border-0 bg-primary-content/20">
                {meta.dirtyCount}
              </span>
            ) : null}
          </button>
        </div>
      </div>
    </div>
  );
}

function getFilterMeta<TValues extends FilterValues>({
  values,
  appliedFilters,
  fields,
  countConditions,
}: {
  values: TValues;
  appliedFilters: TValues;
  fields: ReadonlyArray<keyof TValues>;
  countConditions: (values: TValues) => number;
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
    overLimit: conditionCount > MAX_DATAFORSEO_FILTER_CONDITIONS,
  };
}
