import type {
  PromptExplorerModel,
  WebSearchCountryCode,
} from "@/types/schemas/ai-search";

const MODEL_LABELS: Record<PromptExplorerModel, string> = {
  chat_gpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

export function formatModelLabel(model: PromptExplorerModel): string {
  return MODEL_LABELS[model];
}

const COUNTRY_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

export function formatCountryLabel(code: WebSearchCountryCode): string {
  return COUNTRY_NAMES.of(code) ?? code;
}
