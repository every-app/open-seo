import type { ReactNode } from "react";
import { Info, Search } from "lucide-react";
import { cn } from "cn";
import { getFieldError } from "@/client/lib/forms";
import { MAX_KEYWORDS_PER_SUBMIT } from "@/client/features/keywords/keywordResearchTypes";
import { isLabsLocationCode } from "@/client/features/keywords/locations";
import { LocationChipSelect } from "@/client/components/LocationSelect";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@/client/components/ui/input-group";
import { KeywordAreaField } from "./KeywordAreaField";
import { KeywordSearchOptions } from "./KeywordSearchOptions";
import type { KeywordResearchControllerState } from "./types";

type Props = {
  controller: KeywordResearchControllerState;
  /** Shown inside the card, under the search controls. */
  children?: ReactNode;
};

function getTextareaRows(value: string): number {
  const newlines = (value.match(/\n/g) ?? []).length;
  const lines = newlines + 1;
  return Math.min(MAX_KEYWORDS_PER_SUBMIT, Math.max(1, lines));
}

export function KeywordResearchSearchBar({ controller, children }: Props) {
  const { controlsForm, handleSearchSubmit, hasSearched } = controller;
  // Results need the room, so everything shares one row from xl.
  const compact = hasSearched;

  return (
    <Card>
      <CardContent className="space-y-3">
        <form
          noValidate
          className={cn(
            "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3",
            compact && "xl:grid-cols-[minmax(0,1fr)_auto_auto]",
          )}
          onSubmit={handleSearchSubmit}
        >
          <controlsForm.Field name="keyword">
            {(field) => {
              const keywordError = getFieldError(field.state.meta.errors);
              const rows = getTextareaRows(field.state.value);

              return (
                // Extra lines grow the field.
                <InputGroup className="bg-card">
                  <InputGroupAddon
                    className={rows > 1 ? "self-start pt-3" : undefined}
                  >
                    <Search />
                  </InputGroupAddon>
                  <InputGroupTextarea
                    className={cn(
                      "min-h-0 leading-6 field-sizing-fixed",
                      compact ? "py-[7px]" : "py-[11px] md:text-base",
                    )}
                    rows={rows}
                    placeholder="Enter a keyword, or a pattern like best * for dogs"
                    aria-label="Keywords"
                    aria-invalid={keywordError ? true : undefined}
                    value={field.state.value}
                    onChange={(event) => field.handleChange(event.target.value)}
                    onKeyDown={(event) => {
                      // Enter submits. Shift+Enter inserts a newline, so
                      // researching several keywords at once means adding a
                      // line per keyword (or pasting newline-separated ones).
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void controlsForm.handleSubmit();
                      }
                    }}
                  />
                </InputGroup>
              );
            }}
          </controlsForm.Field>

          <Button
            type="submit"
            size={compact ? "default" : "lg"}
            className={compact ? "xl:order-last" : undefined}
          >
            Search
          </Button>

          <div
            className={cn(
              "col-span-2 flex min-w-0 flex-wrap items-center gap-2",
              compact && "xl:col-span-1 xl:flex-nowrap",
            )}
          >
            <controlsForm.Field name="locationCode">
              {(field) => (
                <LocationChipSelect
                  value={field.state.value}
                  onChange={(code) => {
                    field.handleChange(code);
                    // An area belongs to one country.
                    controlsForm.setFieldValue("locationName", undefined);
                  }}
                />
              )}
            </controlsForm.Field>

            <controlsForm.Subscribe
              selector={(state) => state.values.locationCode}
            >
              {(locationCode) => (
                <controlsForm.Field name="locationName">
                  {(field) => (
                    <KeywordAreaField
                      locationCode={locationCode}
                      value={field.state.value}
                      onChange={(name) => field.handleChange(name)}
                    />
                  )}
                </controlsForm.Field>
              )}
            </controlsForm.Subscribe>

            <KeywordSearchOptions controller={controller} />
          </div>
        </form>
        <controlsForm.Field name="keyword">
          {(field) => {
            const keywordError = getFieldError(field.state.meta.errors);

            return keywordError ? (
              <p role="alert" className="text-sm text-destructive">
                {keywordError}
              </p>
            ) : null;
          }}
        </controlsForm.Field>
        <controlsForm.Subscribe selector={(state) => state.values.locationCode}>
          {(locationCode) =>
            isLabsLocationCode(locationCode) ? null : (
              <Alert variant="info" role="status">
                <Info />
                <AlertDescription>
                  Keyword data for this country comes from Google Ads — search
                  volume, CPC, and trends are available, but difficulty and
                  intent are not.
                </AlertDescription>
              </Alert>
            )
          }
        </controlsForm.Subscribe>
        {children}
      </CardContent>
    </Card>
  );
}
