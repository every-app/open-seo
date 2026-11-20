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
import {
  DRAFT_RECEIVED,
  editPrompt,
  editRefused,
  reportPrompt,
  reportTitle,
} from "./prompt";
import {
  newRun,
  reportTools,
  SUBMIT_TOOL,
  submissionSchema,
  type Submission,
} from "./tools";

// Writes one report: a model follows the skill, looking up search data and
// reading the site's pages, until it hands the report in. It runs inside one
// Workflow step, in the Worker: the model can only call the tools in
// tools.ts, so there is nothing to sandbox and no key it could read.
//
// What it hands in first is a draft. It is then asked to edit the draft
// with the clean-copy skill, and what it hands in next is the report. The edit is the same conversation, so the
// research is still in front of the model while it cuts, and the second
// hand-in is held to everything the first was. It may change words, and not
// the plan's data (dataChanged): an edit that does is refused with what
// differed, and the model may hand in once more.
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
// And which host answered.
const hostSchema = z.object({ openrouter: z.object({ provider: z.string() }) });

/**
 * What an edit changed in the plan's data, in words the model can act on,
 * or null when it left the data alone: the same moves in the same order,
 * each with the keyword, searches, difficulty and page it had.
 */
function dataChanged(draft: Submission, edited: Submission): string | null {
  if (draft.moves.length !== edited.moves.length)
    return `the draft had ${draft.moves.length} moves and the edit has ${edited.moves.length}`;
  for (const [index, move] of draft.moves.entries())
    for (const field of ["keyword", "searches", "difficulty", "page"] as const)
      if (move[field] !== edited.moves[index]?.[field])
        return `move ${index + 1}'s ${field} was ${JSON.stringify(move[field])} and the edit has ${JSON.stringify(edited.moves[index]?.[field])}`;
  return null;
}

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
    // Which hosts answered, and how much the model reasoned in all: a host
    // that ignores the reasoning effort shows here as zero.
    providers: [
      ...new Set(
        steps.flatMap(
          (step) =>
            hostSchema.safeParse(step.providerMetadata).data?.openrouter
              .provider ?? [],
        ),
      ),
    ],
    reasoningTokens: steps.reduce(
      (sum, step) => sum + (step.usage.outputTokenDetails.reasoningTokens ?? 0),
      0,
    ),
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
    let said: ModelMessage[] = [{ role: "user", content: reportPrompt(site) }];
    /** Lets the model go on from what has been said until it hands in or reaches a limit. */
    const attempt = () => {
      const before = said;
      return generateText({
        model,
        messages: before,
        tools,
        stopWhen: [hasToolCall(SUBMIT_TOOL), atLimit],
        onStepFinish: (step) => {
          steps.push(step);
          said = [...before, ...step.response.messages];
        },
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxRetries: MODEL_RETRIES,
        abortSignal,
      });
    };
    let pickedUp = false;
    const turn = () =>
      attempt().catch(async (error: unknown) => {
        // A call is only made with allowance left, and a failed one uses
        // none, so the second try starts under every limit and counts
        // toward them. A run is picked up once.
        if (pickedUp || !fromProvider(error)) throw error;
        pickedUp = true;
        console.warn(
          JSON.stringify({ event: "seo_report_resumed", site, ...used() }),
        );
        await new Promise((resolve) => setTimeout(resolve, RESUME_AFTER_MS));
        return attempt();
      });
    /** What a turn handed in, with the call that carried it, or why it can't be used. */
    const handedIn = (result: Awaited<ReturnType<typeof attempt>>) => {
      if (steps.some(unmetered))
        return fail(
          FailedSide.Provider,
          "a model reply didn't say how many tokens it used, so it couldn't be priced",
        );
      const call = result.toolCalls.find(
        (call) => call.toolName === SUBMIT_TOOL,
      );
      if (!call)
        return fail(
          FailedSide.Ours,
          "it reached a limit before the report was handed in",
        );
      const submission = submissionSchema.safeParse(call.input);
      if (!submission.success)
        return fail(FailedSide.Ours, "what it handed in doesn't fit");
      const { status, reason, headline, moves, markdown } = submission.data;
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
      if (!moves.length) return fail(FailedSide.Ours, "the report has no plan");
      if (!markdown.trim()) return fail(FailedSide.Ours, "the report is empty");
      return { id: call.toolCallId, submission: submission.data };
    };

    const draft = handedIn(await turn());
    if (typeof draft === "string") return draft;
    if (atLimit())
      return fail(
        FailedSide.Ours,
        "it reached a limit before the report was edited",
      );
    /** What a hand-in is answered with. */
    const answer = (id: string, value: string): ModelMessage => ({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: id,
          toolName: SUBMIT_TOOL,
          output: { type: "text", value },
        },
      ],
    });
    said = [
      ...said,
      answer(draft.id, DRAFT_RECEIVED),
      { role: "user", content: editPrompt() },
    ];
    let edited = handedIn(await turn());
    if (typeof edited === "string") return edited;
    let changed = dataChanged(draft.submission, edited.submission);
    if (changed) {
      // The model's slip, and one it can put right: it is told what
      // differed and hands in again, once.
      if (atLimit())
        return fail(
          FailedSide.Ours,
          `the edit changed the plan's data (${changed}) and a limit was reached before it could be put right`,
        );
      said = [...said, answer(edited.id, editRefused(changed))];
      edited = handedIn(await turn());
      if (typeof edited === "string") return edited;
      changed = dataChanged(draft.submission, edited.submission);
      if (changed)
        return fail(
          FailedSide.Ours,
          `the edit changed the plan's data twice: ${changed}`,
        );
    }
    const { headline, standing, customer, moves, markdown } = edited.submission;
    checkCost();
    console.log(
      JSON.stringify({ event: "seo_report_written", site, ...used() }),
    );
    return {
      site,
      title: reportTitle(site),
      headline,
      standing,
      customer,
      moves,
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
