import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import {
  secret,
  StandIn,
  usesStandIn,
  type ModelConfig,
  type SeoReportEnv,
} from "./config";

// The model that writes a report, through OpenRouter. SEO_REPORT_MODEL in
// wrangler.jsonc names it, with its reasoning effort and its prices.

export async function reportModel(
  env: SeoReportEnv,
  config: ModelConfig,
  site: string,
): Promise<LanguageModel> {
  if (usesStandIn(env, StandIn.Model)) {
    const { standInModel } = await import("./stand-in-model");
    return standInModel(site);
  }
  const openrouter = createOpenRouter({
    apiKey: secret(env, "OPENROUTER_API_KEY"),
  });
  return openrouter(config.id, {
    // Each reply then carries what OpenRouter charged, which the run checks
    // its own count against.
    usage: { include: true },
    extraBody: { reasoning: { effort: config.effort } },
  });
}
