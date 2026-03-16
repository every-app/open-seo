import { Search } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import type { BacklinksSearchState } from "./backlinksPageTypes";
import { resolveBacklinksSearchScope } from "./backlinksSearchScope";

type SearchDraft = Pick<
  BacklinksSearchState,
  "target" | "scope" | "subdomains" | "indirect" | "excludeInternal" | "status"
>;

function toBacklinksStatus(value: string): SearchDraft["status"] {
  if (value === "live" || value === "lost" || value === "all") {
    return value;
  }

  return "live";
}

export function BacklinksSearchCard({
  errorMessage,
  initialValues,
  isFetching,
  onSubmit,
}: {
  errorMessage: string | null;
  initialValues: SearchDraft;
  isFetching: boolean;
  onSubmit: (values: SearchDraft) => void;
}) {
  const [targetInput, setTargetInput] = useState(initialValues.target);
  const [scope, setScope] = useState(initialValues.scope);
  const [includeSubdomains, setIncludeSubdomains] = useState(
    initialValues.subdomains,
  );
  const [includeIndirectLinks, setIncludeIndirectLinks] = useState(
    initialValues.indirect,
  );
  const [excludeInternalBacklinks, setExcludeInternalBacklinks] = useState(
    initialValues.excludeInternal,
  );
  const [status, setStatus] = useState(initialValues.status);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [userSelectedScope, setUserSelectedScope] = useState(false);

  useEffect(() => {
    setTargetInput(initialValues.target);
    setScope(initialValues.scope);
    setIncludeSubdomains(initialValues.subdomains);
    setIncludeIndirectLinks(initialValues.indirect);
    setExcludeInternalBacklinks(initialValues.excludeInternal);
    setStatus(initialValues.status);
    setFormError(null);
    setUserSelectedScope(false);
  }, [initialValues]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    const target = targetInput.trim();
    if (!target) {
      setFormError("Enter a domain or URL to analyze.");
      return;
    }

    setFormError(null);
    onSubmit({
      target,
      scope: resolveBacklinksSearchScope({
        target,
        selectedScope: scope,
        userSelectedScope,
      }),
      subdomains: includeSubdomains,
      indirect: includeIndirectLinks,
      excludeInternal: excludeInternalBacklinks,
      status,
    });
  };

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <form className="space-y-3" onSubmit={handleSubmit}>
          <SearchControls
            formError={formError}
            isFetching={isFetching}
            onScopeChange={setScope}
            onStatusChange={(value) => setStatus(toBacklinksStatus(value))}
            onTargetInputChange={setTargetInput}
            setFormError={setFormError}
            scope={scope}
            status={status}
            targetInput={targetInput}
            userSelectedScope={userSelectedScope}
            onUserSelectedScopeChange={setUserSelectedScope}
          />
          <SearchToggles
            includeSubdomains={includeSubdomains}
            onIncludeSubdomainsChange={setIncludeSubdomains}
            showAdvanced={showAdvanced}
            toggleAdvanced={() => setShowAdvanced((current) => !current)}
          />
          {showAdvanced ? (
            <AdvancedSearchOptions
              excludeInternalBacklinks={excludeInternalBacklinks}
              includeIndirectLinks={includeIndirectLinks}
              onExcludeInternalChange={setExcludeInternalBacklinks}
              onIncludeIndirectChange={setIncludeIndirectLinks}
            />
          ) : null}
        </form>
        {formError ? <p className="text-sm text-error">{formError}</p> : null}
        {errorMessage ? (
          <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SearchControls({
  formError,
  isFetching,
  onScopeChange,
  onStatusChange,
  onTargetInputChange,
  onUserSelectedScopeChange,
  setFormError,
  scope,
  status,
  targetInput,
  userSelectedScope,
}: {
  formError: string | null;
  isFetching: boolean;
  onScopeChange: (value: BacklinksSearchState["scope"]) => void;
  onStatusChange: (value: string) => void;
  onTargetInputChange: (value: string) => void;
  onUserSelectedScopeChange: (value: boolean) => void;
  setFormError: (value: string | null) => void;
  scope: BacklinksSearchState["scope"];
  status: BacklinksSearchState["status"];
  targetInput: string;
  userSelectedScope: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <label
          className={`input input-bordered lg:col-span-8 flex items-center gap-2 ${formError ? "input-error" : ""}`}
        >
          <Search className="size-4 text-base-content/60" />
          <input
            placeholder={
              scope === "page"
                ? "Enter a page URL or domain"
                : "Enter a domain or URL"
            }
            value={targetInput}
            onChange={(event) => {
              const nextTarget = event.target.value;
              onTargetInputChange(nextTarget);
              if (!userSelectedScope) {
                onScopeChange(
                  resolveBacklinksSearchScope({
                    target: nextTarget,
                    selectedScope: scope,
                    userSelectedScope: false,
                  }),
                );
              }
              if (formError) setFormError(null);
            }}
          />
        </label>
        <select
          className="select select-bordered lg:col-span-2"
          value={status}
          onChange={(event) => onStatusChange(event.target.value)}
        >
          <option value="live">Live links</option>
          <option value="lost">Lost links</option>
          <option value="all">All links</option>
        </select>
        <button
          type="submit"
          className="btn btn-primary lg:col-span-2"
          disabled={isFetching}
        >
          {isFetching ? "Loading..." : "Search"}
        </button>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={`btn btn-xs ${scope === "domain" ? "btn-soft" : "btn-ghost"}`}
          onClick={() => {
            onUserSelectedScopeChange(true);
            onScopeChange("domain");
          }}
        >
          Site-wide
        </button>
        <button
          type="button"
          className={`btn btn-xs ${scope === "page" ? "btn-soft" : "btn-ghost"}`}
          onClick={() => {
            onUserSelectedScopeChange(true);
            onScopeChange("page");
          }}
        >
          Exact page
        </button>
      </div>
    </div>
  );
}

function SearchToggles({
  includeSubdomains,
  onIncludeSubdomainsChange,
  showAdvanced,
  toggleAdvanced,
}: {
  includeSubdomains: boolean;
  onIncludeSubdomainsChange: (checked: boolean) => void;
  showAdvanced: boolean;
  toggleAdvanced: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="label cursor-pointer gap-2 py-0">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={includeSubdomains}
          onChange={(event) => onIncludeSubdomainsChange(event.target.checked)}
        />
        <span className="label-text">Include subdomains</span>
      </label>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={toggleAdvanced}
      >
        {showAdvanced ? "Hide advanced" : "Show advanced"}
      </button>
    </div>
  );
}

function AdvancedSearchOptions({
  excludeInternalBacklinks,
  includeIndirectLinks,
  onExcludeInternalChange,
  onIncludeIndirectChange,
}: {
  excludeInternalBacklinks: boolean;
  includeIndirectLinks: boolean;
  onExcludeInternalChange: (checked: boolean) => void;
  onIncludeIndirectChange: (checked: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-xl border border-base-300 bg-base-200/40 p-4 text-sm md:grid-cols-2">
      <label className="label cursor-pointer justify-start gap-3 py-0">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={includeIndirectLinks}
          onChange={(event) => onIncludeIndirectChange(event.target.checked)}
        />
        <span className="label-text">Include indirect links</span>
      </label>
      <label className="label cursor-pointer justify-start gap-3 py-0">
        <input
          type="checkbox"
          className="checkbox checkbox-sm"
          checked={excludeInternalBacklinks}
          onChange={(event) => onExcludeInternalChange(event.target.checked)}
        />
        <span className="label-text">Exclude internal backlinks</span>
      </label>
    </div>
  );
}
