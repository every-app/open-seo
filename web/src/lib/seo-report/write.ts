import {
  APICallError,
  generateText,
  hasToolCall,
  RetryError,
  type ModelMessage,
  type StepResult,
  type ToolSet,
} from "ai";
import { z } from "zod";
import { SEO_REPORT_MODEL_USD } from "@/lib/free-tools/spend";
import {
  reportModelConfig,
  secret,
  StandIn,
  usesStandIn,
  type ModelConfig,
  type SeoReportEnv,
} from "./config";
import type { StoredReport } from "./desk";
import { ReportFailure } from "./failure";
import { REPORT_LIMITS } from "./limits";
import { reportModel } from "./model";
import { reportPrompt, reportTitle } from "./prompt";
import { newRun, reportTools, SUBMIT_TOOL, submissionSchema } from "./tools";

// Writes one report: a model follows the skill, looking up search data and
// reading the site's pages, until it hands the report in. It runs inside one
// Workflow step, in the Worker: the model can only call the tools in
// tools.ts, so there is nothing to sandbox and no key it could read.
//
// The model's provider can turn a run away part-way, after its search data
// is paid for. Each model call is retried for about a minute, and a run that
// still fails is picked up once more from where it stopped, with everything
// it had already looked up, so the research isn't bought twice.
//
// Every cost has a ceiling here. A run that reaches the model-call, token,
// dollar or time limit ends without a report. One that reaches a tool's limit
// is told so and finishes with what it has. What it hands in is checked
// against the expected shape; its links and images are dealt with where the
// report is made into a PDF (pdf.ts).

const RUN_MS = REPORT_LIMITS.runMinutes * 60_000;
const MODEL_RETRIES = 5;
const RESUME_AFTER_MS = 30_000;
/**
 * The most one model call may write, reasoning included. The longest report
 * a run may hand in is about 15,000 tokens; the real ones were under 4,000.
 */
const MAX_OUTPUT_TOKENS = 16_000;

/** Whose failure it was, for the log: the model's provider, the site, or this tool and its limits. */
enum FailedSide {
  Provider = "provider",
  Site = "site",
  Ours = "ours",
}
const fromProvider = (error: unknown) =>
  APICallError.isInstance(error) || RetryError.isInstance(error);
// OpenRouter adds what it charged for a reply when asked to (model.ts).
const chargedSchema = z.object({
  openrouter: z.object({ usage: z.object({ cost: z.number() }) }),
});

type Step = StepResult<ToolSet>;
const tokens = (steps: Step[]) =>
  steps.reduce((sum, step) => sum + (step.usage.totalTokens ?? 0), 0);
const bytes = (value: unknown) =>
  new TextEncoder().encode(
    typeof value === "string" ? value : JSON.stringify(value),
  ).length;
/** A reply that doesn't say how many tokens it used can't be priced. */
const unmetered = (step: Step) =>
  step.usage.inputTokens === undefined || step.usage.outputTokens === undefined;

/** What `input` and `output` tokens cost at the model's list price, `cached` of the input read from the cache. */
function listUsd(
  model: ModelConfig,
  tokens: { input: number; cached: number; output: number },
): number {
  const long = tokens.input >= model.longPromptTokens;
  return (
    ((tokens.input - tokens.cached) *
      (long ? model.longInputUsd : model.inputUsd) +
      tokens.cached * (long ? model.longCachedInputUsd : model.cachedInputUsd) +
      tokens.output * (long ? model.longOutputUsd : model.outputUsd)) /
    1_000_000
  );
}

/** What a model call cost, counted from the tokens it reports. */
const countedUsd = (model: ModelConfig, step: Step) =>
  listUsd(model, {
    input: step.usage.inputTokens ?? 0,
    cached: step.usage.inputTokenDetails.cacheReadTokens ?? 0,
    output: step.usage.outputTokens ?? 0,
  });
/** What OpenRouter says it charged for the call, when it says. */
const chargedUsd = (step: Step) =>
  chargedSchema.safeParse(step.providerMetadata).data?.openrouter.usage.cost;

/**
 * The most the next model call can cost. Its input is the last call's input
 * and output, plus the tool answers that call asked for, and a token is
 * never shorter than a byte, so counting those answers in bytes can only
 * overstate it. None of it is assumed to come from the cache. Its output is
 * capped (MAX_OUTPUT_TOKENS).
 */
function nextCallUsd(model: ModelConfig, last: Step | undefined): number {
  if (!last) return 0;
  return listUsd(model, {
    input:
      (last.usage.inputTokens ?? 0) +
      (last.usage.outputTokens ?? 0) +
      last.toolResults.reduce((sum, result) => sum + bytes(result.output), 0),
    cached: 0,
    output: MAX_OUTPUT_TOKENS,
  });
}

/**
 * The report, or why there is none. Either way one log line says what the
 * run used: `seo_report_written` or `seo_report_failed`.
 */
export async function writeReport(
  env: SeoReportEnv,
  site: string,
): Promise<StoredReport | ReportFailure> {
  const started = Date.now();
  const run = newRun(site);
  // Kept as they finish, so a run that dies part-way still says what it used.
  const steps: Step[] = [];
  const config = reportModelConfig(env);
  // The tool doesn't open without a priced model (config.ts).
  if (!config) throw new Error("SEO_REPORT_MODEL has no prices.");
  // A run's spend is counted here, from each reply's tokens at the model's
  // list price. OpenRouter's own figure is a check on that count, and when
  // it is the larger of the two it is the one that counts.
  const counted = () =>
    steps.reduce((sum, step) => sum + countedUsd(config, step), 0);
  const charged = () =>
    steps.reduce((sum, step) => sum + (chargedUsd(step) ?? 0), 0);
  const modelUsd = () =>
    steps.reduce(
      (sum, step) =>
        sum + Math.max(countedUsd(config, step), chargedUsd(step) ?? 0),
      0,
    );
  const used = () => ({
    seconds: Math.round((Date.now() - started) / 1000),
    dataUsd: Number(run.dataUsd.toFixed(4)),
    modelUsd: Number(modelUsd().toFixed(4)),
    // What OpenRouter says it charged, beside our count of the same calls.
    countedUsd: Number(counted().toFixed(4)),
    chargedUsd: Number(charged().toFixed(4)),
    modelCalls: steps.length,
    tokens: tokens(steps),
    // What it did, in order, to tell a thin report from a thorough one.
    calls: steps.flatMap((step) => step.toolCalls.map((call) => call.toolName)),
  });
  /** Says so when the two figures for the model's cost are far apart: the price in config is probably out of date. */
  const checkCost = () => {
    const [ours, theirs] = [counted(), charged()];
    if (theirs > 0 && Math.abs(ours - theirs) > Math.max(0.01, theirs / 4))
      console.warn(
        JSON.stringify({
          event: "seo_report_cost_mismatch",
          site,
          model: config.id,
          countedUsd: Number(ours.toFixed(4)),
          chargedUsd: Number(theirs.toFixed(4)),
        }),
      );
  };
  const fail = (
    side: FailedSide,
    reason: string,
    failure = ReportFailure.Failed,
  ) => {
    checkCost();
    console.error(
      JSON.stringify({
        event: "seo_report_failed",
        site,
        side,
        reason,
        ...used(),
      }),
    );
    return failure;
  };
  try {
    const model = await reportModel(env, config, site);
    const tools = reportTools(
      usesStandIn(env, StandIn.Model)
        ? null
        : secret(env, "DATAFORSEO_API_KEY"),
      run,
    );
    const abortSignal = AbortSignal.timeout(RUN_MS);
    // Counted over the whole run, so a resumed run gets no new allowance.
    // The dollar limit looks one call ahead: the run stops before a call
    // that could take it past the cap, not after one that did.
    const atLimit = () =>
      steps.some(unmetered) ||
      steps.length >= REPORT_LIMITS.modelCalls ||
      tokens(steps) >= REPORT_LIMITS.tokens ||
      modelUsd() + nextCallUsd(config, steps.at(-1)) > SEO_REPORT_MODEL_USD;

    // The conversation so far: the prompt, then every finished model call
    // and the tool answers it got.
    const prompt: ModelMessage = {
      role: "user",
      content: reportPrompt(site, new Date().toISOString().slice(0, 10)),
    };
    let finished: ModelMessage[] = [];
    const attempt = (messages: ModelMessage[]) =>
      generateText({
        model,
        messages,
        tools,
        stopWhen: [hasToolCall(SUBMIT_TOOL), atLimit],
        onStepFinish: (step) => {
          steps.push(step);
          finished = step.response.messages;
        },
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxRetries: MODEL_RETRIES,
        abortSignal,
      });
    const result = await attempt([prompt]).catch(async (error: unknown) => {
      // A call is only made with allowance left, and a failed one uses none,
      // so the second try starts under every limit and counts toward them.
      if (!fromProvider(error)) throw error;
      console.warn(
        JSON.stringify({ event: "seo_report_resumed", site, ...used() }),
      );
      await new Promise((resolve) => setTimeout(resolve, RESUME_AFTER_MS));
      return attempt([prompt, ...finished]);
    });

    if (steps.some(unmetered))
      return fail(
        FailedSide.Provider,
        "a model reply didn't say how many tokens it used, so it couldn't be priced",
      );
    const handedIn = result.toolCalls.find(
      (call) => call.toolName === SUBMIT_TOOL,
    );
    if (!handedIn)
      return fail(
        FailedSide.Ours,
        "it reached a limit before the report was handed in",
      );
    const submission = submissionSchema.safeParse(handedIn.input);
    if (!submission.success)
      return fail(FailedSide.Ours, "what it handed in doesn't fit");
    const { status, reason, headline, takeaways, stats, markdown } =
      submission.data;
    // A stop must say why from the list, and a report must not: the reason
    // chooses a sentence in an email, so it is never taken on trust.
    if ((status === "blocked") !== (reason !== null))
      return fail(FailedSide.Ours, "its status and its reason disagree");
    if (reason !== null)
      return fail(
        reason === ReportFailure.Failed ? FailedSide.Ours : FailedSide.Site,
        `the model stopped (${reason}): ${headline}`,
        reason,
      );
    if (!markdown.trim()) return fail(FailedSide.Ours, "the report is empty");
    checkCost();
    console.log(
      JSON.stringify({ event: "seo_report_written", site, ...used() }),
    );
    return {
      site,
      title: reportTitle(site),
      headline,
      takeaways,
      stats,
      markdown,
      hosts: [...run.hosts],
      writtenAt: new Date().toISOString(),
    };
  } catch (error) {
    return fail(
      fromProvider(error) ? FailedSide.Provider : FailedSide.Ours,
      error instanceof Error ? error.message : "it failed",
    );
  }
}
