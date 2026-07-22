import { useEffect, useMemo, useRef, useState } from "react";
import type { OnPageReport } from "@/serverFunctions/contentOptimization";

/**
 * "Entities by importance" worklist: importance tiers, status filter tabs,
 * and click-to-copy rows. Highly related terms fold in at importance 10.
 */

export const STATUS_COLORS: Record<string, string> = {
  good: "#3fb950",
  present_not_entity: "#d9a94a",
  missing: "#e26d63",
};

type WorklistEntity = {
  name: string;
  importance: number;
  status: string;
};

type FilterKey = "all" | "good" | "present_not_entity" | "missing";

const FILTER_TABS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "good", label: "Covered" },
  { key: "present_not_entity", label: "Found but needs context" },
  { key: "missing", label: "Missing" },
];

const TIERS: Array<{ name: string; test: (importance: number) => boolean }> = [
  { name: "Critical · importance 10", test: (i) => i === 10 },
  { name: "High priority · 7–9", test: (i) => i >= 7 && i <= 9 },
  { name: "Supporting · 5–6", test: (i) => i >= 5 && i <= 6 },
  { name: "Lower priority · 1–4", test: (i) => i >= 1 && i <= 4 },
];

export function buildWorklistEntities(
  coverage: OnPageReport["entity_coverage"],
): WorklistEntity[] {
  const named = new Set(
    coverage.natural_language_entities.map((e) => e.entity),
  );
  return [
    ...coverage.highly_related_terms
      .filter((t) => !named.has(t.entity))
      .map((t) => ({
        name: t.entity,
        importance: 10,
        status: t.coverage_status,
      })),
    ...coverage.natural_language_entities.map((e) => ({
      name: e.entity,
      importance: Math.round(e.importance ?? 0),
      status: e.coverage_status,
    })),
  ].toSorted((a, b) => b.importance - a.importance);
}

export function EntityWorklist({ entities }: { entities: WorklistEntity[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [copiedName, setCopiedName] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    },
    [],
  );

  const counts = useMemo(
    () => ({
      all: entities.length,
      good: entities.filter((e) => e.status === "good").length,
      present_not_entity: entities.filter(
        (e) => e.status === "present_not_entity",
      ).length,
      missing: entities.filter((e) => e.status === "missing").length,
    }),
    [entities],
  );

  const tiers = useMemo(() => {
    const visible =
      filter === "all" ? entities : entities.filter((e) => e.status === filter);
    return TIERS.map((tier) => ({
      name: tier.name,
      items: visible.filter((e) => tier.test(e.importance)),
    })).filter((tier) => tier.items.length > 0);
  }, [entities, filter]);

  const onCopy = (name: string) => {
    void navigator.clipboard.writeText(name);
    setCopiedName(name);
    if (copyTimer.current !== null) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedName(null), 1200);
  };

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Entities by importance</h2>
          <div className="flex items-center gap-4 text-xs text-base-content/60">
            {FILTER_TABS.slice(1).map((tab) => (
              <span key={tab.key} className="inline-flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[tab.key] }}
                />
                {tab.label}
              </span>
            ))}
            <span className="text-base-content/30">·</span>
            <span>Click to copy</span>
          </div>
        </div>

        <div className="flex gap-1 border-b border-base-300 pb-3">
          {FILTER_TABS.map((tab) => {
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`rounded-[3px] px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-base-content/60 hover:bg-base-200/60"
                }`}
              >
                {tab.label}{" "}
                <span
                  className={
                    active ? "text-primary/80" : "text-base-content/40"
                  }
                >
                  {counts[tab.key]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-5">
          {tiers.map((tier) => (
            <div key={tier.name} className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-base-content/50">
                  {tier.name}
                </span>
                <span className="h-px flex-1 bg-base-300" />
                <span className="text-xs text-base-content/40">
                  {tier.items.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
                {tier.items.map((entity) => (
                  <button
                    key={entity.name}
                    type="button"
                    onClick={() => onCopy(entity.name)}
                    className="flex items-center gap-2.5 rounded-[3px] px-2.5 py-2 text-left transition-colors hover:bg-base-200/60"
                  >
                    <span
                      className="size-[9px] shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          copiedName === entity.name
                            ? STATUS_COLORS.good
                            : (STATUS_COLORS[entity.status] ?? "#6a6a72"),
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[14.5px]">
                      {entity.name}
                    </span>
                    {copiedName === entity.name ? (
                      <span className="text-xs font-semibold text-[#3fb950]">
                        Copied
                      </span>
                    ) : (
                      <span className="font-mono text-[12.5px] font-semibold tabular-nums text-base-content/50">
                        {entity.importance}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
