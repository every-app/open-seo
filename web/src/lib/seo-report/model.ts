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

/**
 * The one host the model is run on: OpenAI's own. Left to choose, OpenRouter
 * picks a host for each request, and not every host does the reasoning the
 * request asks for: on 2026-11-20 Amazon Bedrock's answered a question with
 * no reasoning tokens that drew about 80 from OpenAI's and from Azure's. No
 * other host is allowed, so a report is never researched without reasoning.
 * When this host is down or turns a request away, the call fails as any
 * other provider failure does (write.ts).
 */
const HOST = "openai";

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
    provider: { only: [HOST], allow_fallbacks: false },
    extraBody: { reasoning: { effort: config.effort } },
  });
}
