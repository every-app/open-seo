import { useEffect, useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Search } from "lucide-react";
import {
  createFormValidationErrors,
  getFieldError,
  getFormError,
  shouldValidateFieldOnChange,
} from "@/client/lib/forms";
import { ResearchScopeSelect } from "@/client/components/ResearchScopeSelect";
import {
  defaultScopeForInput,
  parseResearchTarget,
} from "@/shared/researchScope";
import type { BacklinksSearchState } from "./backlinksPageTypes";

type SearchDraft = Pick<BacklinksSearchState, "target" | "scope">;

function getBacklinksValidationErrors(
  value: SearchDraft,
  shouldValidateUntouchedField: boolean,
  validateFormat = false,
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

  if (validateFormat) {
    const parsed = parseResearchTarget(value.target, value.scope);
    if (!parsed.ok) {
      return createFormValidationErrors({
        fields: { target: parsed.message },
      });
    }
  }

  return null;
}

export function BacklinksSearchCard({
  errorMessage,
  initialValues,
  onSubmit,
}: {
  errorMessage: string | null;
  initialValues: SearchDraft;
  onSubmit: (values: SearchDraft) => void;
}) {
  const [userSelectedScope, setUserSelectedScope] = useState(false);
  const form = useForm({
    defaultValues: initialValues,
    validators: {
      onChange: ({ formApi, value }) =>
        getBacklinksValidationErrors(
          value,
          shouldValidateFieldOnChange(formApi, "target"),
        ),
      onSubmit: ({ value }) => getBacklinksValidationErrors(value, true, true),
    },
    onSubmit: ({ value }) => {
      onSubmit({ ...value, target: value.target.trim() });
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
                              defaultScopeForInput(nextTarget),
                            );
                          }
                        }}
                      />
                    </label>
                  );
                }}
              </form.Field>

              <form.Field name="scope">
                {(field) => (
                  <ResearchScopeSelect
                    value={field.state.value}
                    onChange={(scope) => {
                      setUserSelectedScope(true);
                      field.handleChange(scope);
                    }}
                  />
                )}
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
