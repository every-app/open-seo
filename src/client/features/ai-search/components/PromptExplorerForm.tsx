import type { FormEvent } from "react";
import {
  formatCountryLabel,
  formatModelLabel,
} from "@/client/features/ai-search/platformLabels";
import {
  PROMPT_EXPLORER_MAX_PROMPT_LENGTH,
  PROMPT_EXPLORER_MODELS,
  WEB_SEARCH_COUNTRY_CODES,
  type PromptExplorerModel,
  type WebSearchCountryCode,
} from "@/types/schemas/ai-search";

import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { NativeSelect } from "@/client/components/ui/native-select";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Textarea } from "@/client/components/ui/textarea";
type FormValues = {
  prompt: string;
  highlightBrand: string;
  models: PromptExplorerModel[];
  webSearch: boolean;
  webSearchCountryCode: WebSearchCountryCode;
};

type Props = {
  form: FormValues;
  onPromptChange: (value: string) => void;
  onHighlightBrandChange: (value: string) => void;
  onModelsChange: (value: PromptExplorerModel[]) => void;
  onWebSearchChange: (value: boolean) => void;
  onCountryChange: (value: WebSearchCountryCode) => void;
  onSubmit: (event: FormEvent) => void;
  isLoading: boolean;
  validationError: string | null;
};

function isCountryCode(value: string): value is WebSearchCountryCode {
  return (WEB_SEARCH_COUNTRY_CODES as readonly string[]).includes(value);
}

function parseCountryCode(value: string): WebSearchCountryCode {
  return isCountryCode(value) ? value : "US";
}

export function PromptExplorerForm({
  form,
  onPromptChange,
  onHighlightBrandChange,
  onModelsChange,
  onWebSearchChange,
  onCountryChange,
  onSubmit,
  isLoading,
  validationError,
}: Props) {
  const toggleModel = (model: PromptExplorerModel) => {
    if (form.models.includes(model)) {
      onModelsChange(form.models.filter((m) => m !== model));
    } else {
      onModelsChange([...form.models, model]);
    }
  };

  const promptCharCount = form.prompt.length;
  const promptOverLimit = promptCharCount > PROMPT_EXPLORER_MAX_PROMPT_LENGTH;

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <CardContent className="pt-6 gap-5">
          <div className="space-y-1.5">
            <label
              className="block text-sm font-medium"
              htmlFor="prompt-explorer-prompt"
            >
              Prompt
            </label>
            <Textarea
              id="prompt-explorer-prompt"
              className={`w-full resize-none ${
                promptOverLimit ? "border-destructive" : ""
              }`}
              rows={3}
              value={form.prompt}
              maxLength={PROMPT_EXPLORER_MAX_PROMPT_LENGTH + 50}
              onChange={(event) => onPromptChange(event.target.value)}
              aria-invalid={promptOverLimit ? true : undefined}
              autoFocus
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>What your customers might ask AI.</span>
              <span
                className={`tabular-nums ${promptOverLimit ? "font-medium text-destructive" : ""}`}
              >
                {promptCharCount}/{PROMPT_EXPLORER_MAX_PROMPT_LENGTH}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                className="block text-sm font-medium"
                htmlFor="prompt-explorer-brand"
              >
                Highlight brand (optional)
              </label>
              <Input
                id="prompt-explorer-brand"
                type="text"
                className="w-full"
                value={form.highlightBrand}
                onChange={(event) => onHighlightBrandChange(event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                We&apos;ll flag whether each model mentions this brand.
              </p>
            </div>

            <div className="space-y-1.5">
              <span className="block text-sm font-medium">Models</span>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1.5">
                {PROMPT_EXPLORER_MODELS.map((model) => {
                  const isActive = form.models.includes(model);
                  return (
                    <label
                      key={model}
                      className="flex cursor-pointer items-center gap-2"
                    >
                      <Checkbox
                        checked={isActive}
                        onCheckedChange={() => toggleModel(model)}
                      />
                      <span className="text-sm">{formatModelLabel(model)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={form.webSearch}
                  onCheckedChange={(checked) => onWebSearchChange(checked)}
                />
                <span className="text-sm">
                  Allow web search (more current answers)
                </span>
              </label>
              <NativeSelect
                id="prompt-explorer-country"
                aria-label="Web search location"
                className="min-w-0 sm:max-w-xs h-8 text-sm"
                value={form.webSearchCountryCode}
                onChange={(event) =>
                  onCountryChange(parseCountryCode(event.target.value))
                }
                disabled={!form.webSearch}
              >
                {WEB_SEARCH_COUNTRY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {formatCountryLabel(code)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button
              type="submit"
              className="shrink-0 px-6"
              disabled={isLoading || form.models.length === 0}
            >
              {isLoading ? "Running…" : "Run"}
            </Button>
          </div>

          {validationError ? (
            <p className="text-sm text-destructive">{validationError}</p>
          ) : null}
        </CardContent>
      </form>
    </Card>
  );
}
