import { Info, Search } from "lucide-react";
import { getFieldError } from "@/client/lib/forms";
import {
  isResultLimit,
  normalizeKeywordMode,
} from "@/client/features/keywords/keywordSearchParams";
import {
  MAX_KEYWORDS_PER_SUBMIT,
  RESULT_LIMITS,
} from "@/client/features/keywords/keywordResearchTypes";
import { isLabsLocationCode } from "@/client/features/keywords/locations";
import { LocationSelect } from "@/client/components/LocationSelect";
import type { KeywordResearchControllerState } from "./types";

import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { NativeSelect } from "@/client/components/ui/native-select";
import { Switch } from "@/client/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip";
import { Textarea } from "@/client/components/ui/textarea";
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
    <Card>
      <CardContent className="pt-6 gap-2">
        <form
          className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-start lg:gap-2"
          onSubmit={handleSearchSubmit}
        >
          <controlsForm.Field name="keyword">
            {(field) => {
              const keywordError = getFieldError(field.state.meta.errors);
              const rows = getTextareaRows(field.state.value);

              return (
                <label
                  className={`flex w-full lg:flex-1 lg:min-w-0 lg:max-w-md items-start gap-2 rounded-lg border bg-card px-4 py-3 transition-colors focus-within:border-primary ${
                    keywordError ? "border-destructive" : "border-border"
                  }`}
                >
                  <Search className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <Textarea
                    className="min-h-0 grow min-w-0 resize-none rounded-none border-0 bg-transparent p-0 text-sm leading-6 shadow-none focus-visible:ring-0"
                    rows={rows}
                    placeholder="Enter a keyword"
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
                </label>
              );
            }}
          </controlsForm.Field>

          <div className="grid grid-cols-2 gap-2 lg:contents">
            <controlsForm.Field name="locationCode">
              {(field) => (
                <LocationSelect
                  value={field.state.value}
                  onChange={(code) => field.handleChange(code)}
                  className="w-full lg:w-44 lg:shrink-0"
                />
              )}
            </controlsForm.Field>

            <controlsForm.Field name="resultLimit">
              {(field) => (
                <NativeSelect
                  className="w-full lg:w-auto lg:shrink-0"
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
                </NativeSelect>
              )}
            </controlsForm.Field>

            <controlsForm.Field name="mode">
              {(field) => (
                <NativeSelect
                  className="w-full lg:w-auto lg:shrink-0"
                  value={field.state.value}
                  onChange={(event) =>
                    field.handleChange(normalizeKeywordMode(event.target.value))
                  }
                >
                  <option value="auto">Auto</option>
                  <option value="related">Related keywords</option>
                  <option value="suggestions">Suggestions</option>
                  <option value="ideas">Ideas</option>
                </NativeSelect>
              )}
            </controlsForm.Field>

            <Button type="submit" className="w-full px-6 lg:w-auto lg:shrink-0">
              Search
            </Button>
          </div>
        </form>
        <controlsForm.Field name="keyword">
          {(field) => {
            const keywordError = getFieldError(field.state.meta.errors);

            return keywordError ? (
              <p className="text-sm text-destructive">{keywordError}</p>
            ) : null;
          }}
        </controlsForm.Field>
        <controlsForm.Field name="locationCode">
          {(locationField) =>
            isLabsLocationCode(locationField.state.value) ? (
              <controlsForm.Field name="clickstream">
                {(field) => (
                  <div className="flex items-center gap-2">
                    <label className="flex cursor-pointer items-center justify-start gap-2 p-0">
                      <Switch
                        checked={field.state.value}
                        onCheckedChange={(checked) =>
                          field.handleChange(checked)
                        }
                      />
                      <span className="text-sm font-medium text-foreground">
                        Clickstream-refined volumes
                      </span>
                    </label>
                    <Tooltip>
                      <TooltipTrigger render={<div tabIndex={0} />}>
                        <Info className="size-3.5 text-muted-foreground/70" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-64">
                        Google reports one combined search volume for similar
                        keywords (e.g. 'seo tool' and 'seo tools'). Turn this on
                        to estimate each keyword's own volume. Costs 2x the
                        credits.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                )}
              </controlsForm.Field>
            ) : (
              <div
                className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-sm text-foreground"
                role="status"
              >
                <Info className="mt-0.5 size-4 shrink-0 text-info" />
                <span>
                  Keyword data for this country comes from Google Ads — search
                  volume, CPC, and trends are available, but difficulty and
                  intent are not.
                </span>
              </div>
            )
          }
        </controlsForm.Field>
      </CardContent>
    </Card>
  );
}
