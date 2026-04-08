import { RotateCcw } from "lucide-react";
import type { BacklinksTab } from "@/types/schemas/backlinks";
import type { BacklinksFiltersState } from "./useBacklinksFilters";

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
    <label className="form-control gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
        {label}
      </span>
      <form.Field name={name}>
        {(field: {
          state: { value: string };
          handleChange: (v: string) => void;
        }) => (
          <input
            className="input input-bordered input-sm w-full bg-base-100"
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
  step,
}: {
  form: AnyForm;
  title: string;
  minName: string;
  maxName: string;
  step?: string;
}) {
  return (
    <div className="rounded-lg border border-base-300 bg-base-100 p-2.5 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
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
  form: AnyForm;
  name: string;
  placeholder: string;
  step?: string;
}) {
  return (
    <form.Field name={name}>
      {(field: {
        state: { value: string };
        handleChange: (v: string) => void;
      }) => (
        <input
          className="input input-bordered input-xs bg-base-100"
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

function BacklinksTabFilters({
  form,
}: {
  form: BacklinksFiltersState["backlinks"]["form"];
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <FilterTextInput
          form={form}
          name="include"
          label="Include Terms"
          placeholder="example.com, blog"
        />
        <FilterTextInput
          form={form}
          name="exclude"
          label="Exclude Terms"
          placeholder="spam, forum"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <FilterRangeInputs
          form={form}
          title="Domain Authority"
          minName="minDomainRank"
          maxName="maxDomainRank"
        />
        <FilterRangeInputs
          form={form}
          title="Link Authority"
          minName="minLinkAuthority"
          maxName="maxLinkAuthority"
        />
        <FilterRangeInputs
          form={form}
          title="Spam Score"
          minName="minSpamScore"
          maxName="maxSpamScore"
          step="0.1"
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
            Link Type
          </p>
          <form.Field name="linkType">
            {(field) => (
              <div className="flex items-center gap-1">
                {(["", "dofollow", "nofollow"] as const).map((value) => (
                  <button
                    key={value || "all"}
                    type="button"
                    className={`btn btn-xs ${field.state.value === value ? "btn-soft" : "btn-ghost"}`}
                    onClick={() => field.handleChange(value)}
                  >
                    {value === ""
                      ? "All"
                      : value === "dofollow"
                        ? "Dofollow"
                        : "Nofollow"}
                  </button>
                ))}
              </div>
            )}
          </form.Field>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-base-content/60">
            Visibility
          </p>
          <div className="flex items-center gap-3">
            <form.Field name="hideLost">
              {(field) => (
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    checked={field.state.value === "true"}
                    onChange={(event) =>
                      field.handleChange(event.target.checked ? "true" : "")
                    }
                  />
                  <span className="text-xs">Hide lost</span>
                </label>
              )}
            </form.Field>
            <form.Field name="hideBroken">
              {(field) => (
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="checkbox checkbox-xs"
                    checked={field.state.value === "true"}
                    onChange={(event) =>
                      field.handleChange(event.target.checked ? "true" : "")
                    }
                  />
                  <span className="text-xs">Hide broken</span>
                </label>
              )}
            </form.Field>
          </div>
        </div>
      </div>
    </>
  );
}

function ReferringDomainsFilters({
  form,
}: {
  form: BacklinksFiltersState["domains"]["form"];
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <FilterTextInput
          form={form}
          name="include"
          label="Include Terms"
          placeholder="example.com, blog"
        />
        <FilterTextInput
          form={form}
          name="exclude"
          label="Exclude Terms"
          placeholder="spam, forum"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
        <FilterRangeInputs
          form={form}
          title="Backlinks"
          minName="minBacklinks"
          maxName="maxBacklinks"
        />
        <FilterRangeInputs
          form={form}
          title="Rank"
          minName="minRank"
          maxName="maxRank"
        />
      </div>
    </>
  );
}

function TopPagesFilters({
  form,
}: {
  form: BacklinksFiltersState["pages"]["form"];
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <FilterTextInput
          form={form}
          name="include"
          label="Include Terms"
          placeholder="/blog, /products"
        />
        <FilterTextInput
          form={form}
          name="exclude"
          label="Exclude Terms"
          placeholder="/tag, /author"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <FilterRangeInputs
          form={form}
          title="Backlinks"
          minName="minBacklinks"
          maxName="maxBacklinks"
        />
        <FilterRangeInputs
          form={form}
          title="Referring Domains"
          minName="minReferringDomains"
          maxName="maxReferringDomains"
        />
        <FilterRangeInputs
          form={form}
          title="Rank"
          minName="minRank"
          maxName="maxRank"
        />
      </div>
    </>
  );
}

export function BacklinksFilterPanel({
  activeTab,
  filters,
}: {
  activeTab: BacklinksTab;
  filters: BacklinksFiltersState;
}) {
  const current = filters[activeTab];

  return (
    <div className="shrink-0 border-b border-base-300 bg-gradient-to-b from-base-100 to-base-200/30 px-4 py-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">Refine results</p>
          {current.activeFilterCount > 0 ? (
            <span className="badge badge-xs badge-primary border-0 text-primary-content">
              {current.activeFilterCount} active
            </span>
          ) : null}
        </div>
        <button
          className="btn btn-xs btn-ghost gap-1"
          onClick={current.reset}
          disabled={current.activeFilterCount === 0}
        >
          <RotateCcw className="size-3" />
          Clear all
        </button>
      </div>

      {activeTab === "backlinks" ? (
        <BacklinksTabFilters form={filters.backlinks.form} />
      ) : null}
      {activeTab === "domains" ? (
        <ReferringDomainsFilters form={filters.domains.form} />
      ) : null}
      {activeTab === "pages" ? (
        <TopPagesFilters form={filters.pages.form} />
      ) : null}
    </div>
  );
}
