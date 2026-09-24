import type { FormEvent } from "react";
import { AlertCircle, Search } from "lucide-react";
import { getFieldError, getFormError } from "@/client/lib/forms";
import type { DomainOverviewControlsForm } from "@/client/features/domain/DomainOverviewPage";
import { toSortMode } from "@/client/features/domain/utils";
import type { DomainSortMode } from "@/client/features/domain/types";
import { LABS_LOCATION_OPTIONS } from "@/client/features/keywords/locations";
import { LocationSelect } from "@/client/components/LocationSelect";
import { ResearchScopeSelect } from "@/client/components/ResearchScopeSelect";
import type { ResearchScope } from "@/shared/researchScope";

import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { NativeSelect } from "@/client/components/ui/native-select";
import { InputGroup } from "@/client/components/ui/input-group";
import { Input } from "@/client/components/ui/input";
type Props = {
  controlsForm: DomainOverviewControlsForm;
  isLoading: boolean;
  onSubmit: (event: FormEvent) => void;
  onDomainChange: (domain: string) => void;
  onScopeChange: (scope: ResearchScope) => void;
  onSortChange: (sort: DomainSortMode) => void;
  onLocationChange: (locationCode: number) => void;
};

export function DomainSearchCard({
  controlsForm,
  isLoading,
  onSubmit,
  onDomainChange,
  onScopeChange,
  onSortChange,
  onLocationChange,
}: Props) {
  return (
    <Card>
      <CardContent className="pt-6 gap-4">
        <form
          className="flex flex-col gap-3 lg:flex-row lg:items-center"
          onSubmit={onSubmit}
        >
          <controlsForm.Field name="domain">
            {(field) => {
              const domainError = getFieldError(field.state.meta.errors);

              return (
                <InputGroup
                  className="w-full lg:flex-1 lg:min-w-0 lg:max-w-md"
                  error={Boolean(domainError)}
                  prefix={<Search className="size-4 text-muted-foreground" />}
                >
                  <Input
                    placeholder="Enter a domain or URL"
                    value={field.state.value}
                    onChange={(event) => {
                      field.handleChange(event.target.value);
                      onDomainChange(event.target.value);
                    }}
                    aria-invalid={domainError ? true : undefined}
                    aria-describedby={
                      domainError ? "domain-input-error" : undefined
                    }
                  />
                </InputGroup>
              );
            }}
          </controlsForm.Field>

          <controlsForm.Field name="scope">
            {(field) => (
              <ResearchScopeSelect
                value={field.state.value}
                className="w-full lg:w-40"
                onChange={(scope) => {
                  field.handleChange(scope);
                  onScopeChange(scope);
                }}
              />
            )}
          </controlsForm.Field>

          <controlsForm.Field name="locationCode">
            {(field) => (
              <LocationSelect
                value={field.state.value}
                options={LABS_LOCATION_OPTIONS}
                className="w-full lg:w-44 lg:shrink-0"
                onChange={(code) => {
                  field.handleChange(code);
                  onLocationChange(code);
                }}
              />
            )}
          </controlsForm.Field>

          <controlsForm.Field name="sort">
            {(field) => (
              <NativeSelect
                className="shrink-0"
                value={field.state.value}
                onChange={(event) => {
                  const next = toSortMode(event.target.value) ?? "traffic";
                  field.handleChange(next);
                  onSortChange(next);
                }}
              >
                <option value="rank">By Rank</option>
                <option value="traffic">By Traffic</option>
                <option value="volume">By Volume</option>
                <option value="score">By Score</option>
                <option value="cpc">By CPC</option>
              </NativeSelect>
            )}
          </controlsForm.Field>

          <controlsForm.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button
                type="submit"
                className="shrink-0 px-6"
                disabled={isLoading || isSubmitting}
              >
                {isLoading || isSubmitting ? "Loading..." : "Search"}
              </Button>
            )}
          </controlsForm.Subscribe>
        </form>

        <controlsForm.Field name="domain">
          {(field) => {
            const domainError = getFieldError(field.state.meta.errors);

            return domainError ? (
              <p id="domain-input-error" className="text-sm text-destructive">
                {domainError}
              </p>
            ) : null;
          }}
        </controlsForm.Field>

        <controlsForm.Subscribe selector={(state) => state.errorMap.onSubmit}>
          {(submitError) => {
            const errorMessage = getFormError(submitError);

            return errorMessage ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            ) : null;
          }}
        </controlsForm.Subscribe>
      </CardContent>
    </Card>
  );
}
