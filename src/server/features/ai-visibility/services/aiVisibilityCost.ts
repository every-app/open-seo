import { AiVisibilityRepository as repo } from "../repositories/AiVisibilityRepository";
import { AiVisibilityError } from "./aiVisibilityErrors";
import { aiScope } from "./aiVisibilityConfiguration";
import {
  getOptionalEnvValue,
  isHostedServerAuthMode,
} from "@/server/lib/runtime-env";
import {
  aiEngineUsesModelApi,
  AI_ENGINE_LABELS,
  AI_LIVE_RECORD_COST_USD,
  AI_RECORD_COST_USD,
  type AiCostEstimate,
  type AiEngine,
} from "@/shared/ai-visibility";
import { llmResponseUsd } from "@/server/lib/dataforseo/pricing";
import {
  AUTUMN_SEO_DATA_CREDITS_PER_USD,
  creditsForProviderUsd,
} from "@/shared/billing";
import { scheduledChecksPerMonth } from "@/shared/rank-tracking";
import type { EstimateAiCostInput } from "@/types/schemas/ai-visibility";
import { projectPatch } from "./aiVisibilityMutation";

/**
 * Raw DataForSEO USD for one answer. Claude and Perplexity always use the
 * model API. The other engines are live on Run now and queued otherwise.
 */
function aiAnswerUsd(engine: AiEngine, mode: "live" | "queued") {
  if (aiEngineUsesModelApi(engine)) return llmResponseUsd(engine, true);
  return mode === "live" ? AI_LIVE_RECORD_COST_USD : AI_RECORD_COST_USD;
}

/**
 * The customer's cost for a check, given one engine per answer: credits when
 * hosted, else provider USD.
 */
export function aiCostForAnswers(
  engines: AiEngine[],
  hosted: boolean,
  mode: "live" | "queued",
) {
  let providerUsd = 0;
  let costCredits = 0;
  for (const engine of engines) {
    const usd = aiAnswerUsd(engine, mode);
    providerUsd += usd;
    costCredits += creditsForProviderUsd(usd);
  }
  const providerCostUsd = Math.round(providerUsd * 1e6) / 1e6;
  return {
    providerCostUsd,
    costCredits: hosted ? costCredits : 0,
    costUsd: hosted
      ? costCredits / AUTUMN_SEO_DATA_CREDITS_PER_USD
      : providerCostUsd,
  };
}

export async function estimateCost(
  input: EstimateAiCostInput,
): Promise<AiCostEstimate> {
  const current = await repo.getConfiguration(input.projectId);
  const config = input.patch
    ? (await projectPatch(input.projectId, input.patch, current)).rows
    : current;
  if (!config)
    throw new AiVisibilityError(
      "TRACKER_REQUIRED",
      "Set your project's website and pass proposed prompts, or save tracking before estimating.",
    );
  const scope = aiScope(config, input.promptIds);
  const answers = scope.prompts.flatMap(() => scope.engines);
  const hosted = await isHostedServerAuthMode();
  const cost = aiCostForAnswers(answers, hosted, "queued");
  const runNow = aiCostForAnswers(answers, hosted, "live");
  const liveEngines = scope.engines.filter(aiEngineUsesModelApi);
  const scheduleInterval =
    input.scheduleInterval ?? current?.tracker.scheduleInterval ?? "weekly";
  const checksPerMonth = scheduledChecksPerMonth(scheduleInterval);
  return {
    promptCount: scope.prompts.length,
    engineCount: scope.engines.length,
    observations: answers.length,
    ...cost,
    runNowCostUsd: runNow.costUsd,
    runNowCostCredits: runNow.costCredits,
    scheduleInterval,
    checksPerMonth,
    monthlyCostUsd: Math.round(cost.costUsd * checksPerMonth * 1e6) / 1e6,
    currency: "USD",
    warnings: [
      hosted
        ? "Customer cost uses OpenSEO data credits, including the service markup."
        : "Self-hosted: cost estimates your own DataForSEO account charges. OpenSEO credits are not used.",
      `One fresh answer per prompt and engine. The ${scheduleInterval} estimate assumes ${checksPerMonth} ${checksPerMonth === 1 ? "check" : "checks"} per month.`,
      ...(liveEngines.length
        ? [
            `${liveEngines.map((e) => AI_ENGINE_LABELS[e]).join(" and ")} ${liveEngines.length === 1 ? "uses" : "use"} live API pricing, which costs more per answer.`,
          ]
        : []),
      ...(!(await getOptionalEnvValue("DATAFORSEO_API_KEY"))
        ? [
            "DataForSEO is not configured on this server. Setup is available; collection needs an operator to add its API key.",
          ]
        : []),
    ],
  };
}
