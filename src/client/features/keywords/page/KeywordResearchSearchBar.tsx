import { Search } from "lucide-react";
import { getFieldError } from "@/client/lib/forms";
import {
  isResultLimit,
  normalizeKeywordMode,
} from "@/client/features/keywords/keywordSearchParams";
import { RESULT_LIMITS } from "@/client/features/keywords/keywordResearchTypes";
import { LOCATION_OPTIONS } from "@/client/features/keywords/locations";
import type { KeywordResearchControllerState } from "./types";

type Props = {
  controller: KeywordResearchControllerState;
};

export function KeywordResearchSearchBar({ controller }: Props) {
  const { controlsForm, handleSearchSubmit, isLoading } = controller;

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-2">
        <form
          className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-2"
          onSubmit={handleSearchSubmit}
        >
          <controlsForm.Field name="keyword">
            {(field) => {
              const keywordError = getFieldError(field.state.meta.errors);

              return (
                <label
                  className={`input input-bordered flex items-center gap-2 w-full lg:flex-1 lg:min-w-0 lg:max-w-md ${keywordError ? "input-error" : ""}`}
                >
                  <Search className="size-4 shrink-0 text-base-content/60" />
                  <input
                    className="grow min-w-0"
                    placeholder="Enter keyword"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </label>
              );
            }}
          </controlsForm.Field>

          <div className="grid grid-cols-2 gap-2 lg:contents">
            <controlsForm.Field name="locationCode">
              {(field) => (
                <select
                  className="select select-bordered w-full lg:w-auto lg:shrink-0"
                  value={field.state.value}
                  onChange={(event) =>
                    field.handleChange(Number(event.target.value))
                  }
                >
                  {LOCATION_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </controlsForm.Field>

            <controlsForm.Field name="resultLimit">
              {(field) => (
                <select
                  className="select select-bordered w-full lg:w-auto lg:shrink-0"
                  value={field.state.value}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    field.handleChange(isResultLimit(next) ? next : 150);
                  }}
                >
                  {RESULT_LIMITS.map((limit) => (
                    <option key={limit} value={limit}>
                      {limit} results
                    </option>
                  ))}
                </select>
              )}
            </controlsForm.Field>

            <controlsForm.Field name="mode">
              {(field) => (
                <select
                  className="select select-bordered w-full lg:w-auto lg:shrink-0"
                  value={field.state.value}
                  onChange={(event) =>
                    field.handleChange(normalizeKeywordMode(event.target.value))
                  }
                >
                  <option value="auto">Auto</option>
                  <option value="related">Related keywords</option>
                  <option value="suggestions">Suggestions</option>
                  <option value="ideas">Ideas</option>
                </select>
              )}
            </controlsForm.Field>

            <button
              type="submit"
              className="btn btn-primary w-full px-6 font-semibold lg:w-auto lg:shrink-0"
              disabled={isLoading}
            >
              {isLoading ? "Searching..." : "Search"}
            </button>
          </div>
        </form>
        <controlsForm.Field name="keyword">
          {(field) => {
            const keywordError = getFieldError(field.state.meta.errors);

            return keywordError ? (
              <p className="text-sm text-error">{keywordError}</p>
            ) : null;
          }}
        </controlsForm.Field>
      </div>
    </div>
  );
}
