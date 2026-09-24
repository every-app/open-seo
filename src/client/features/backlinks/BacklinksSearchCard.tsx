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

import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { InputGroup } from "@/client/components/ui/input-group";
import { Input } from "@/client/components/ui/input";
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
    <Card>
      <CardContent className="pt-6 gap-4">
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
                    <InputGroup
                      className="flex-1"
                      error={Boolean(targetError)}
                      prefix={
                        <Search className="size-4 text-muted-foreground" />
                      }
                    >
                      <Input
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
                    </InputGroup>
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
                  <Button
                    type="submit"
                    className="shrink-0 px-6"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Loading..." : "Search"}
                  </Button>
                )}
              </form.Subscribe>
            </div>

            <form.Field name="target">
              {(field) => {
                const targetError = getFieldError(field.state.meta.errors);

                return targetError ? (
                  <p className="text-sm text-destructive">{targetError}</p>
                ) : null;
              }}
            </form.Field>

            <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
              {(submitError) => {
                const formError = getFormError(submitError);

                return formError ? (
                  <p className="text-sm text-destructive">{formError}</p>
                ) : null;
              }}
            </form.Subscribe>
          </div>
        </form>

        {errorMessage ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
