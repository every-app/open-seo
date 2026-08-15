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
    <form
      onSubmit={onSubmit}
      className="card border border-base-300 bg-base-100"
    >
      <div className="card-body gap-5">
        <div className="space-y-1.5">
          <label
            className="block text-sm font-medium"
            htmlFor="prompt-explorer-prompt"
          >
            提示词
          </label>
          <textarea
            id="prompt-explorer-prompt"
            className={`textarea textarea-bordered w-full resize-none ${
              promptOverLimit ? "textarea-error" : ""
            }`}
            rows={3}
            value={form.prompt}
            maxLength={PROMPT_EXPLORER_MAX_PROMPT_LENGTH + 50}
            onChange={(event) => onPromptChange(event.target.value)}
            aria-invalid={promptOverLimit ? true : undefined}
            autoFocus
          />
          <div className="flex items-center justify-between text-xs text-base-content/60">
            <span>客户可能向 AI 提出的问题。</span>
            <span
              className={`tabular-nums ${promptOverLimit ? "font-medium text-error" : ""}`}
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
              突出显示品牌（可选）
            </label>
            <input
              id="prompt-explorer-brand"
              type="text"
              className="input input-bordered w-full"
              value={form.highlightBrand}
              onChange={(event) => onHighlightBrandChange(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="text-xs text-base-content/60">
              系统会标记每个模型是否提及此品牌。
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="block text-sm font-medium">模型</span>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1.5">
              {PROMPT_EXPLORER_MODELS.map((model) => {
                const isActive = form.models.includes(model);
                return (
                  <label
                    key={model}
                    className="flex cursor-pointer items-center gap-2"
                  >
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={isActive}
                      onChange={() => toggleModel(model)}
                    />
                    <span className="text-sm">{formatModelLabel(model)}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={form.webSearch}
                onChange={(event) => onWebSearchChange(event.target.checked)}
              />
              <span className="text-sm">允许联网搜索（回答更及时）</span>
            </label>
            <select
              id="prompt-explorer-country"
              aria-label="联网搜索地区"
              className="select select-bordered select-sm min-w-0 sm:max-w-xs"
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
            </select>
          </div>
          <button
            type="submit"
            className="btn btn-primary shrink-0 px-6"
            disabled={isLoading || form.models.length === 0}
          >
            {isLoading ? "运行中…" : "运行"}
          </button>
        </div>

        {validationError ? (
          <p className="text-sm text-error">{validationError}</p>
        ) : null}
      </div>
    </form>
  );
}
