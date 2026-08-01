import { useEffect, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Search } from "lucide-react";
import {
  createFormValidationErrors,
  getFieldError,
  getFormError,
  shouldValidateFieldOnChange,
} from "@/client/lib/forms";
import type { BacklinksSearchState } from "./backlinksPageTypes";
import {
  inferBacklinksSearchScopeFromTarget,
  resolveBacklinksSearchScope,
} from "./backlinksSearchScope";

type SearchDraft = Pick<BacklinksSearchState, "target" | "scope">;

function getBacklinksValidationErrors(
  value: SearchDraft,
  shouldValidateUntouchedField: boolean,
  canOpenSearch?: (value: SearchDraft) => boolean,
  tabLimit?: number,
) {
  if (!value.target.trim()) {
    if (!shouldValidateUntouchedField) {
      return null;
    }

    return createFormValidationErrors({
      fields: {
        target: "Enter a domain or URL to analyze.",
      },
    });
  }

  const normalizedValue = {
    ...value,
    target: value.target.trim(),
  };

  if (canOpenSearch && !canOpenSearch(normalizedValue)) {
    return createFormValidationErrors({
      fields: {
        target: `Close a tab to open more searches (max ${tabLimit ?? 8}).`,
      },
    });
  }

  return null;
}

export function BacklinksSearchCard({
  canOpenSearch,
  errorMessage,
  initialValues,
  onSubmit,
  tabLimit,
}: {
  canOpenSearch?: (values: SearchDraft) => boolean;
  errorMessage: string | null;
  initialValues: SearchDraft;
  onSubmit: (values: SearchDraft) => void;
  tabLimit?: number;
}) {
  const [userSelectedScope, setUserSelectedScope] = useState(false);
  const form = useForm({
    defaultValues: initialValues,
    validators: {
      onChange: ({ formApi, value }) =>
        getBacklinksValidationErrors(
          value,
          shouldValidateFieldOnChange(formApi, "target"),
          canOpenSearch,
          tabLimit,
        ),
      onSubmit: ({ value }) =>
        getBacklinksValidationErrors(value, true, canOpenSearch, tabLimit),
    },
    onSubmit: ({ value }) => {
      const target = value.target.trim();
      const scope = resolveBacklinksSearchScope({
        target,
        selectedScope: value.scope,
        userSelectedScope,
      });

      onSubmit({
        ...value,
        target,
        scope,
      });
    },
  });

  useEffect(() => {
    form.reset(initialValues);
    setUserSelectedScope(false);
  }, [form, initialValues]);

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <div className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row">
              <form.Field name="target">
                {(field) => {
                  const targetError = getFieldError(field.state.meta.errors);

                  return (
                    <label
                      className={`input input-bordered flex flex-1 items-center gap-2 ${targetError ? "input-error" : ""}`}
                    >
                      <Search className="size-4 text-base-content/60" />
                      <input
                        placeholder="Enter a domain or URL"
                        value={field.state.value}
                        onChange={(event) => {
                          const nextTarget = event.target.value;
                          field.handleChange(nextTarget);
                          if (!userSelectedScope) {
                            form.setFieldValue(
                              "scope",
                              inferBacklinksSearchScopeFromTarget(nextTarget),
                            );
                          }
                        }}
                      />
                    </label>
                  );
                }}
              </form.Field>

              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <button
                    type="submit"
                    className="btn btn-primary shrink-0 px-6"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Loading..." : "Search"}
                  </button>
                )}
              </form.Subscribe>
            </div>

            <form.Field name="target">
              {(field) => {
                const targetError = getFieldError(field.state.meta.errors);

                return targetError ? (
                  <p className="text-sm text-error">{targetError}</p>
                ) : null;
              }}
            </form.Field>

            <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
              {(submitError) => {
                const formError = getFormError(submitError);

                return formError ? (
                  <p className="text-sm text-error">{formError}</p>
                ) : null;
              }}
            </form.Subscribe>

            <div className="flex items-center gap-1">
              <form.Field name="scope">
                {(field) => (
                  <>
                    <button
                      type="button"
                      className={`btn btn-xs ${field.state.value === "domain" ? "btn-soft" : "btn-ghost"}`}
                      onClick={() => {
                        setUserSelectedScope(true);
                        field.handleChange("domain");
                      }}
                    >
                      Site-wide
                    </button>
                    <button
                      type="button"
                      className={`btn btn-xs ${field.state.value === "page" ? "btn-soft" : "btn-ghost"}`}
                      onClick={() => {
                        setUserSelectedScope(true);
                        field.handleChange("page");
                      }}
                    >
                      Exact page
                    </button>
                  </>
                )}
              </form.Field>
            </div>
          </div>
        </form>

        {errorMessage ? (
          <div className="rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </div>
  );
}
