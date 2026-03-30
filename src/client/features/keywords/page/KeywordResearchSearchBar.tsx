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
    <div className="shrink-0 px-4 md:px-6 pt-4 pb-2 max-w-8xl mx-auto w-full">
      <form
        className="bg-base-100 border border-base-300 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2"
        onSubmit={handleSearchSubmit}
      >
        <controlsForm.Field name="keyword">
          {(field) => {
            const keywordError = getFieldError(field.state.meta.errors);

            return (
              <label
                className={`input input-bordered input-sm flex items-center gap-2 flex-1 min-w-0 max-w-md ${keywordError ? "input-error" : ""}`}
              >
                <Search className="size-3.5 shrink-0 text-base-content/50" />
                <input
                  className="grow min-w-0"
                  placeholder="Enter Keyword"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
              </label>
            );
          }}
        </controlsForm.Field>

        <controlsForm.Field name="locationCode">
          {(field) => (
            <select
              className="select select-bordered select-sm w-auto"
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
              className="select select-bordered select-sm w-auto"
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
              className="select select-bordered select-sm w-auto"
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
          className="btn btn-primary btn-sm px-6 font-semibold"
          disabled={isLoading}
        >
          {isLoading ? "Searching..." : "Search"}
        </button>
      </form>
      <controlsForm.Field name="keyword">
        {(field) => {
          const keywordError = getFieldError(field.state.meta.errors);

          return keywordError ? (
            <p className="mt-2 text-sm text-error">{keywordError}</p>
          ) : null;
        }}
      </controlsForm.Field>
    </div>
  );
}
