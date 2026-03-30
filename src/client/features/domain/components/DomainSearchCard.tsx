import type { FormEvent } from "react";
import { AlertCircle, Search } from "lucide-react";
import { getFieldError, getFormError } from "@/client/lib/forms";
import type { useDomainOverviewController } from "@/client/features/domain/useDomainOverviewController";
import { toSortMode } from "@/client/features/domain/utils";
import type { DomainSortMode } from "@/client/features/domain/types";

type Props = {
  controlsForm: ReturnType<typeof useDomainOverviewController>["controlsForm"];
  isLoading: boolean;
  onSubmit: (event: FormEvent) => void;
  onSortChange: (sort: DomainSortMode) => void;
};

export function DomainSearchCard({
  controlsForm,
  isLoading,
  onSubmit,
  onSortChange,
}: Props) {
  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <form
          className="grid grid-cols-1 gap-3 lg:grid-cols-12"
          onSubmit={onSubmit}
        >
          <controlsForm.Field name="domain">
            {(field) => {
              const domainError = getFieldError(field.state.meta.errors);

              return (
                <label
                  className={`input input-bordered lg:col-span-8 flex items-center gap-2 ${domainError ? "input-error" : ""}`}
                >
                  <Search className="size-4 text-base-content/60" />
                  <input
                    placeholder="Enter a domain (e.g. coolify.io or example.com/blog)"
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={domainError ? true : undefined}
                    aria-describedby={
                      domainError ? "domain-input-error" : undefined
                    }
                  />
                </label>
              );
            }}
          </controlsForm.Field>

          <controlsForm.Field name="sort">
            {(field) => (
              <select
                className="select select-bordered lg:col-span-2"
                value={field.state.value}
                onChange={(event) => {
                  const next = toSortMode(event.target.value) ?? "rank";
                  field.handleChange(next);
                  onSortChange(next);
                }}
              >
                <option value="rank">By Rank</option>
                <option value="traffic">By Traffic</option>
                <option value="volume">By Volume</option>
              </select>
            )}
          </controlsForm.Field>

          <controlsForm.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <button
                type="submit"
                className="btn btn-primary lg:col-span-2"
                disabled={isLoading || isSubmitting}
              >
                {isLoading || isSubmitting ? "Loading..." : "Search"}
              </button>
            )}
          </controlsForm.Subscribe>
        </form>

        <controlsForm.Field name="domain">
          {(field) => {
            const domainError = getFieldError(field.state.meta.errors);

            return domainError ? (
              <p id="domain-input-error" className="text-sm text-error">
                {domainError}
              </p>
            ) : null;
          }}
        </controlsForm.Field>

        <controlsForm.Subscribe selector={(state) => state.errorMap.onSubmit}>
          {(submitError) => {
            const errorMessage = getFormError(submitError);

            return errorMessage ? (
              <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error flex items-start gap-2">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            ) : null;
          }}
        </controlsForm.Subscribe>

        <div className="flex flex-wrap items-center gap-3">
          <label className="label cursor-pointer gap-2 py-0">
            <controlsForm.Field name="subdomains">
              {(field) => (
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm"
                  checked={field.state.value}
                  onChange={(event) => field.handleChange(event.target.checked)}
                />
              )}
            </controlsForm.Field>
            <span className="label-text">Include subdomains</span>
          </label>
        </div>
      </div>
    </div>
  );
}
