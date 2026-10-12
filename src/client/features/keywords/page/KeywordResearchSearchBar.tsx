import { Info, Search } from "lucide-react";
import { getFieldError } from "@/client/lib/forms";
import { MAX_KEYWORDS_PER_SUBMIT } from "@/client/features/keywords/keywordResearchTypes";
import { isLabsLocationCode } from "@/client/features/keywords/locations";
import { LocationSelect } from "@/client/components/LocationSelect";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from "@/client/components/ui/input-group";
import { KeywordAreaField, LocalVolumeCostNote } from "./KeywordAreaField";
import { KeywordSearchOptions } from "./KeywordSearchOptions";
import type { KeywordResearchControllerState } from "./types";

type Props = {
  controller: KeywordResearchControllerState;
};

function getTextareaRows(value: string): number {
  const newlines = (value.match(/\n/g) ?? []).length;
  const lines = newlines + 1;
  return Math.min(MAX_KEYWORDS_PER_SUBMIT, Math.max(1, lines));
}

export function KeywordResearchSearchBar({ controller }: Props) {
  const { controlsForm, handleSearchSubmit } = controller;

  return (
    // The city field opens an absolute menu below the row, so the card must
    // not clip it.
    <Card className="overflow-visible">
      <CardContent className="space-y-2">
        <form
          noValidate
          className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start"
          onSubmit={handleSearchSubmit}
        >
          <controlsForm.Field name="keyword">
            {(field) => {
              const keywordError = getFieldError(field.state.meta.errors);
              const rows = getTextareaRows(field.state.value);

              return (
                // Extra lines grow the field.
                <InputGroup className="min-h-10 w-full lg:max-w-md lg:min-w-0 lg:flex-1">
                  <InputGroupAddon
                    className={rows > 1 ? "self-start pt-3" : undefined}
                  >
                    <Search />
                  </InputGroupAddon>
                  <InputGroupTextarea
                    className="min-h-0 py-[7px] leading-6 field-sizing-fixed"
                    rows={rows}
                    placeholder="Enter a keyword"
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

          <div className="grid grid-cols-2 gap-2 lg:contents">
            <controlsForm.Field name="locationCode">
              {(field) => (
                <LocationSelect
                  value={field.state.value}
                  onChange={(code) => {
                    field.handleChange(code);
                    // An area belongs to one country.
                    controlsForm.setFieldValue("locationName", undefined);
                  }}
                  className="col-span-2 w-full lg:w-44 lg:shrink-0"
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

            <Button type="submit" className="w-full px-6 lg:w-auto lg:shrink-0">
              Search
            </Button>
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
        <controlsForm.Subscribe
          selector={(state) =>
            [state.values.locationCode, state.values.locationName] as const
          }
        >
          {([locationCode, locationName]) => (
            <>
              {isLabsLocationCode(locationCode) ? null : (
                <Alert variant="info" role="status">
                  <Info />
                  <AlertDescription>
                    Keyword data for this country comes from Google Ads — search
                    volume, CPC, and trends are available, but difficulty and
                    intent are not.
                  </AlertDescription>
                </Alert>
              )}
              {locationName ? <LocalVolumeCostNote /> : null}
            </>
          )}
        </controlsForm.Subscribe>
      </CardContent>
    </Card>
  );
}
