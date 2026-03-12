import type { ComponentType, FormEvent, ReactNode } from "react";
import { AlertCircle, Search } from "lucide-react";
import { toSortMode } from "@/client/features/domain/utils";
import type { DomainSortMode } from "@/client/features/domain/types";

type FieldHost = {
  Field: ComponentType<{
    name: "domain" | "sort" | "subdomains";
    children: (field: unknown) => ReactNode;
  }>;
};

type TextField = {
  state: { value: string };
  handleChange: (value: string) => void;
};

type SortField = {
  state: { value: DomainSortMode };
  handleChange: (value: DomainSortMode) => void;
};

type ToggleField = {
  state: { value: boolean };
  handleChange: (value: boolean) => void;
};

function isTextField(field: unknown): field is TextField {
  if (!field || typeof field !== "object") return false;
  const candidate = field as {
    state?: { value?: unknown };
    handleChange?: unknown;
  };
  return (
    typeof candidate.handleChange === "function" &&
    typeof candidate.state?.value === "string"
  );
}

function isSortField(field: unknown): field is SortField {
  if (!isTextField(field)) return false;
  return (
    field.state.value === "rank" ||
    field.state.value === "traffic" ||
    field.state.value === "volume"
  );
}

function isToggleField(field: unknown): field is ToggleField {
  if (!field || typeof field !== "object") return false;
  const candidate = field as {
    state?: { value?: unknown };
    handleChange?: unknown;
  };
  return (
    typeof candidate.handleChange === "function" &&
    typeof candidate.state?.value === "boolean"
  );
}

type Props = {
  controlsForm: FieldHost;
  domainError: string | null;
  overviewError: string | null;
  isLoading: boolean;
  onSubmit: (event: FormEvent) => void;
  onSortChange: (sort: DomainSortMode) => void;
  onDomainInput: () => void;
};

export function DomainSearchCard({
  controlsForm,
  domainError,
  overviewError,
  isLoading,
  onSubmit,
  onSortChange,
  onDomainInput,
}: Props) {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <form
          className="grid grid-cols-1 gap-3 lg:grid-cols-12"
          onSubmit={onSubmit}
        >
          <label
            className={`input input-bordered lg:col-span-8 flex items-center gap-2 ${domainError ? "input-error" : ""}`}
          >
            <Search className="size-4 text-base-content/60" />
            <controlsForm.Field name="domain">
              {(field) => {
                if (!isTextField(field)) return null;
                return (
                  <input
                    placeholder="Enter a domain (e.g. coolify.io or example.com/blog)"
                    value={field.state.value}
                    onChange={(e) => {
                      field.handleChange(e.target.value);
                      onDomainInput();
                    }}
                    aria-invalid={domainError ? true : undefined}
                    aria-describedby={
                      domainError ? "domain-input-error" : undefined
                    }
                  />
                );
              }}
            </controlsForm.Field>
          </label>

          <controlsForm.Field name="sort">
            {(field) => {
              if (!isSortField(field)) return null;
              return (
                <select
                  className="select select-bordered lg:col-span-2"
                  value={field.state.value}
                  onChange={(e) => {
                    const next = toSortMode(e.target.value) ?? "rank";
                    field.handleChange(next);
                    onSortChange(next);
                  }}
                >
                  <option value="rank">By Rank</option>
                  <option value="traffic">By Traffic</option>
                  <option value="volume">By Volume</option>
                </select>
              );
            }}
          </controlsForm.Field>

          <button
            type="submit"
            className="btn btn-primary lg:col-span-2"
            disabled={isLoading}
          >
            {isLoading ? "Loading..." : "Search"}
          </button>
        </form>

        {domainError ? (
          <p id="domain-input-error" className="text-sm text-error">
            {domainError}
          </p>
        ) : null}

        {overviewError ? (
          <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error flex items-start gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>{overviewError}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <label className="label cursor-pointer gap-2 py-0">
            <controlsForm.Field name="subdomains">
              {(field) => {
                if (!isToggleField(field)) return null;
                return (
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={field.state.value}
                    onChange={(e) => field.handleChange(e.target.checked)}
                  />
                );
              }}
            </controlsForm.Field>
            <span className="label-text">Include subdomains</span>
          </label>
        </div>
      </div>
    </div>
  );
}
