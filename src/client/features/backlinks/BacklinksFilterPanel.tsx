import { DomainFilterPanel } from "@/client/features/domain/components/DomainFilterPanel";
import type { BacklinksTab } from "@/types/schemas/backlinks";
import {
  BACKLINKS_FILTER_FIELDS,
  REFERRING_DOMAINS_FILTER_FIELDS,
  TOP_PAGES_FILTER_FIELDS,
  countFilterConditions,
  type BacklinksTabFilterValues,
} from "./backlinksFilterTypes";
import type { BacklinksFiltersState } from "./useBacklinksFilters";

/**
 * Filters are applied explicitly (not per keystroke) because every change
 * triggers a billed DataForSEO request. Each include/exclude term and each
 * set field costs one DataForSEO filter condition, capped per request —
 * DomainFilterPanel surfaces the count and gates Apply.
 */
export function BacklinksFilterPanel({
  activeTab,
  filters,
  onApplied,
}: {
  activeTab: BacklinksTab;
  filters: BacklinksFiltersState;
  onApplied: () => void;
}) {
  if (activeTab === "backlinks") {
    const state = filters.backlinks;
    return (
      <DomainFilterPanel
        key="backlinks"
        debugName="BacklinksFilterPanel"
        appliedFilters={state.values}
        fields={BACKLINKS_FILTER_FIELDS}
        activeFilterCount={state.activeFilterCount}
        countConditions={countFilterConditions}
        textFields={[
          {
            key: "include",
            label: "来源网址包含",
            placeholder: "example.com、博客",
          },
          {
            key: "exclude",
            label: "来源网址排除",
            placeholder: "垃圾内容、论坛",
          },
        ]}
        rangeFields={[
          {
            title: "域名权威度",
            minKey: "minDomainRank",
            maxKey: "maxDomainRank",
          },
          {
            title: "链接权威度",
            minKey: "minLinkAuthority",
            maxKey: "maxLinkAuthority",
          },
          {
            title: "垃圾链接分数",
            minKey: "minSpamScore",
            maxKey: "maxSpamScore",
            step: "0.1",
          },
        ]}
        onApply={(values) => {
          state.apply(values);
          onApplied();
        }}
        onClear={() => {
          state.reset();
          onApplied();
        }}
        renderExtra={(draft, setValue) => (
          <BacklinksToggleControls draft={draft} setValue={setValue} />
        )}
      />
    );
  }

  if (activeTab === "domains") {
    const state = filters.domains;
    return (
      <DomainFilterPanel
        key="domains"
        debugName="ReferringDomainsFilterPanel"
        appliedFilters={state.values}
        fields={REFERRING_DOMAINS_FILTER_FIELDS}
        activeFilterCount={state.activeFilterCount}
        countConditions={countFilterConditions}
        textFields={[
          {
            key: "include",
            label: "域名包含",
            placeholder: "example.com、博客",
          },
          {
            key: "exclude",
            label: "域名排除",
            placeholder: "垃圾内容、论坛",
          },
        ]}
        rangeFields={[
          {
            title: "反向链接",
            minKey: "minBacklinks",
            maxKey: "maxBacklinks",
          },
          { title: "权威度", minKey: "minRank", maxKey: "maxRank" },
          {
            title: "垃圾链接分数",
            minKey: "minSpamScore",
            maxKey: "maxSpamScore",
            step: "0.1",
          },
        ]}
        onApply={(values) => {
          state.apply(values);
          onApplied();
        }}
        onClear={() => {
          state.reset();
          onApplied();
        }}
      />
    );
  }

  const state = filters.pages;
  return (
    <DomainFilterPanel
      key="pages"
      debugName="TopPagesFilterPanel"
      appliedFilters={state.values}
      fields={TOP_PAGES_FILTER_FIELDS}
      activeFilterCount={state.activeFilterCount}
      countConditions={countFilterConditions}
      textFields={[
        {
          key: "include",
          label: "页面网址包含",
          placeholder: "/blog, /products",
        },
        {
          key: "exclude",
          label: "页面网址排除",
          placeholder: "/tag, /author",
        },
      ]}
      rangeFields={[
        { title: "反向链接", minKey: "minBacklinks", maxKey: "maxBacklinks" },
        {
          title: "引用域名",
          minKey: "minReferringDomains",
          maxKey: "maxReferringDomains",
        },
        { title: "权威度", minKey: "minRank", maxKey: "maxRank" },
      ]}
      onApply={(values) => {
        state.apply(values);
        onApplied();
      }}
      onClear={() => {
        state.reset();
        onApplied();
      }}
    />
  );
}

function BacklinksToggleControls({
  draft,
  setValue,
}: {
  draft: BacklinksTabFilterValues;
  setValue: (key: keyof BacklinksTabFilterValues, value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
          链接类型
        </p>
        <div className="flex items-center gap-1">
          {(["", "dofollow", "nofollow"] as const).map((value) => (
            <button
              key={value || "all"}
              type="button"
              className={`btn btn-xs ${draft.linkType === value ? "btn-soft" : "btn-ghost"}`}
              onClick={() => setValue("linkType", value)}
            >
              {value === ""
                ? "全部"
                : value === "dofollow"
                  ? "Dofollow"
                  : "Nofollow"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
          显示设置
        </p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={draft.hideLost === "true"}
              onChange={(event) =>
                setValue("hideLost", event.target.checked ? "true" : "")
              }
            />
            <span className="text-xs">隐藏已丢失链接</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="checkbox checkbox-xs"
              checked={draft.hideBroken === "true"}
              onChange={(event) =>
                setValue("hideBroken", event.target.checked ? "true" : "")
              }
            />
            <span className="text-xs">隐藏失效链接</span>
          </label>
        </div>
      </div>
    </div>
  );
}
