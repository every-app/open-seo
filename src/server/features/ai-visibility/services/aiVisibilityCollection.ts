import type { BillingCustomerContext } from "@/server/billing/subscription";
import { getUsageCreditsRemaining } from "@/server/billing/subscription";
import {
  createDataforseoClient,
  fetchAiTrackingTaskResult,
  MAX_TASKS_PER_POST,
  type AiTrackingAnswer,
  type PostedAiTrackingTask,
} from "@/server/lib/dataforseo";
import { resolveLatestLlmModelName } from "@/server/lib/dataforseo/llm-models";
import { AppError } from "@/server/lib/errors";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { getIsoCountryCode } from "@/shared/keyword-locations";
import {
  aiEngineUsesModelApi,
  type AiBrand,
  type AiEngine,
} from "@/shared/ai-visibility";
import { AiVisibilityRepository as repo } from "../repositories/AiVisibilityRepository";
import {
  parseDataforseoAnswer,
  parseLlmResponseAnswer,
  type ParsedAiAnswer,
} from "../providers/dataforseoEvidence";
import { aiBrands } from "./aiVisibilityConfiguration";
import { aiCostForAnswers } from "./aiVisibilityCost";
import { matchAiBrand } from "./aiVisibilityMatching";
import { failAiRun } from "./aiVisibilityRuns";

// Each function here is one workflow step body: inputs are its parameters and
// the return value is what the workflow engine persists and replays.

interface AiTaskBatch {
  engine: AiEngine;
  /** Tag = answer row id. At most 100 per task_post, 6 per model batch. */
  tasks: { tag: string; prompt: string }[];
}
/** One live answer. A live step mixes engines, so each task names its own. */
interface AiLiveTask {
  tag: string;
  prompt: string;
  engine: AiEngine;
}
export type AiPendingTask = PostedAiTrackingTask & { engine: AiEngine };
interface AiRunMarket {
  locationCode: number;
  languageCode: string;
}

/**
 * Live answers per workflow step. A Worker holds 6 connections open at once,
 * so a larger step only queues calls behind the first 6.
 */
const LIVE_ANSWERS_PER_STEP = 6;

/**
 * Marks the run running and groups its answers into batches. Manual and
 * baseline runs collect live answers so the user sees results sooner.
 * Scheduled runs use the cheaper standard queue. Claude and Perplexity have no
 * LLM Scraper, so every run asks their model API (`modelBatches`). Hosted runs
 * first check that credits cover the whole check, like rank checks.
 */
export async function prepareAiRun(
  runId: string,
  customer: BillingCustomerContext,
): Promise<
  { market: AiRunMarket; modelBatches: AiTaskBatch[] } & (
    | { live: false; batches: AiTaskBatch[] }
    | { live: true; batches: AiLiveTask[][] }
  )
> {
  const run = await repo.getRunInternal(runId);
  if (!run || (run.status !== "queued" && run.status !== "running"))
    throw new AppError("NOT_FOUND", `Run ${runId} is no longer active.`);
  const pending = (await repo.getObservations([runId])).filter(
    (row) => row.status === "pending",
  );
  const live = run.trigger !== "scheduled";
  if (await isHostedServerAuthMode()) {
    const required = aiCostForAnswers(
      pending.map((row) => row.engine),
      true,
      live ? "live" : "queued",
    ).costCredits;
    const credits = await getUsageCreditsRemaining(customer.organizationId);
    if (credits.monthlyRemaining + credits.topupRemaining < required)
      throw new AppError(
        "INSUFFICIENT_CREDITS",
        "Not enough credits for this AI visibility check.",
      );
  }
  await repo.updateRun(runId, { status: "running" });
  const market = {
    locationCode: run.locationCode,
    languageCode: run.languageCode,
  };
  const modelBatches = engineBatches(
    pending.filter((row) => aiEngineUsesModelApi(row.engine)),
    LIVE_ANSWERS_PER_STEP,
  );
  const answers = pending.filter((row) => !aiEngineUsesModelApi(row.engine));
  if (live) {
    const tasks = answers.map((row) => ({
      tag: row.id,
      prompt: row.prompt,
      engine: row.engine,
    }));
    const batches: AiLiveTask[][] = [];
    for (let i = 0; i < tasks.length; i += LIVE_ANSWERS_PER_STEP)
      batches.push(tasks.slice(i, i + LIVE_ANSWERS_PER_STEP));
    return { market, modelBatches, live, batches };
  }
  return {
    market,
    modelBatches,
    live,
    batches: engineBatches(answers, MAX_TASKS_PER_POST),
  };
}

/** Groups answers by engine into batches of at most `size`. */
function engineBatches(
  answers: { id: string; prompt: string; engine: AiEngine }[],
  size: number,
): AiTaskBatch[] {
  const batches: AiTaskBatch[] = [];
  for (const engine of new Set(answers.map((row) => row.engine))) {
    const tasks = answers
      .filter((row) => row.engine === engine)
      .map((row) => ({ tag: row.id, prompt: row.prompt }));
    for (let i = 0; i < tasks.length; i += size)
      batches.push({ engine, tasks: tasks.slice(i, i + size) });
  }
  return batches;
}

/**
 * Posts one batch through the metered client, which bills it. Answers the
 * provider did not accept fail now; the rest are collected later.
 */
export async function postAiBatch(
  runId: string,
  customer: BillingCustomerContext,
  market: AiRunMarket,
  batch: AiTaskBatch,
): Promise<AiPendingTask[]> {
  let posted: PostedAiTrackingTask[] = [];
  let error = "DataForSEO did not accept this prompt.";
  try {
    posted = await createDataforseoClient(customer).aiSearch.trackingTaskPost({
      engine: batch.engine,
      tasks: batch.tasks,
      ...market,
    });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  const accepted = new Set(posted.map((task) => task.tag));
  const rejected = batch.tasks
    .map((task) => task.tag)
    .filter((tag) => !accepted.has(tag));
  if (rejected.length)
    await repo.failPendingObservations(runId, error, rejected);
  return posted.map((task) => ({ ...task, engine: batch.engine }));
}

/**
 * Collects one batch of live answers through the metered client, which bills
 * them, and saves each one. Answers that fail now are not retried.
 */
export async function collectAiLiveBatch(
  runId: string,
  customer: BillingCustomerContext,
  market: AiRunMarket,
  tasks: AiLiveTask[],
) {
  const brands = await runBrands(runId);
  if (!brands) return;
  let settled: PromiseSettledResult<AiTrackingAnswer>[];
  try {
    settled = await createDataforseoClient(customer).aiSearch.trackingLiveBatch(
      tasks.map((task) => ({ engine: task.engine, task, ...market })),
    );
  } catch (error) {
    settled = tasks.map(() => ({ status: "rejected", reason: error }));
  }
  for (const [index, outcome] of settled.entries()) {
    const result: AiTrackingAnswer =
      outcome.status === "fulfilled"
        ? outcome.value
        : {
            status: "failed",
            message:
              outcome.reason instanceof Error
                ? outcome.reason.message
                : String(outcome.reason),
          };
    // Every answer here is already paid for, and the step cannot rerun, so
    // one failed write must not drop the rest. finalizeAiRun fails the
    // answer that stays pending.
    try {
      await saveAiOutcome(runId, tasks[index], result, brands);
    } catch (error) {
      console.error(
        `[ai-visibility] ${runId} could not save answer ${tasks[index].tag}:`,
        error,
      );
    }
  }
}

/**
 * Asks each prompt of a Claude or Perplexity batch through the metered model
 * API client, which bills each answer, and saves each answer as soon as it
 * arrives, so a slow call that hits the step timeout cannot discard answers
 * already paid for. Model answers have no language setting: only the country
 * guides the web search.
 */
export async function collectAiModelBatch(
  runId: string,
  customer: BillingCustomerContext,
  market: AiRunMarket,
  batch: AiTaskBatch,
): Promise<void> {
  const modelSlug = batch.engine;
  if (!aiEngineUsesModelApi(modelSlug))
    throw new AppError("INTERNAL_ERROR", `${modelSlug} has no model API batch`);
  const brands = await runBrands(runId);
  if (!brands) return;
  const client = createDataforseoClient(customer);
  const modelName = await resolveLatestLlmModelName(modelSlug);
  const country = getIsoCountryCode(market.locationCode).toUpperCase();
  await Promise.all(
    batch.tasks.map(async (task) => {
      try {
        const result = await client.aiSearch.llmResponse({
          modelSlug,
          modelName,
          userPrompt: task.prompt,
          webSearch: true,
          // Saving the tracker rejects countries the engine cannot search.
          webSearchCountryCode: country,
          maxOutputTokens: MODEL_MAX_OUTPUT_TOKENS,
        });
        await saveAiAnswer(task.tag, parseLlmResponseAnswer(result), brands);
      } catch (cause) {
        await repo.failPendingObservations(
          runId,
          cause instanceof Error ? cause.message : String(cause),
          [task.tag],
        );
      }
    }),
  );
}

/**
 * Like Prompt Explorer: reasoning models count hidden reasoning against this
 * budget, and a smaller one can leave the visible answer empty.
 */
const MODEL_MAX_OUTPUT_TOKENS = 4096;

/** Concurrent task_get requests within a collect step. */
const TASK_GET_CONCURRENCY = 25;

/**
 * Reads each pending answer once (task_get is free) and saves finished ones
 * with their citations and brand results. Returns the tasks still pending.
 */
export async function collectAiRound(
  runId: string,
  tasks: AiPendingTask[],
): Promise<AiPendingTask[]> {
  const brands = await runBrands(runId);
  if (!brands) return [];
  const stillPending: AiPendingTask[] = [];
  for (let i = 0; i < tasks.length; i += TASK_GET_CONCURRENCY) {
    const chunk = tasks.slice(i, i + TASK_GET_CONCURRENCY);
    const outcomes = await Promise.allSettled(
      chunk.map((task) => fetchAiTrackingTaskResult(task)),
    );
    for (const [index, outcome] of outcomes.entries()) {
      const task = chunk[index];
      // A failed read is retried next round.
      if (outcome.status === "rejected" || outcome.value.status === "pending") {
        stillPending.push(task);
        continue;
      }
      await saveAiOutcome(runId, task, outcome.value, brands);
    }
  }
  return stillPending;
}

/** Brands come from the project as each answer is matched. */
async function runBrands(runId: string) {
  const run = await repo.getRunInternal(runId);
  const project = run ? await repo.getProject(run.projectId) : null;
  if (!run || !project) return null;
  return aiBrands(project, await repo.listCompetitors(project.id));
}

/** Saves a finished answer with its citations and brand results, or fails it. */
async function saveAiOutcome(
  runId: string,
  task: { tag: string; engine: AiEngine },
  outcome: AiTrackingAnswer,
  brands: AiBrand[],
) {
  if (outcome.status === "failed") {
    await repo.failPendingObservations(runId, outcome.message, [task.tag]);
    return;
  }
  const answer = parseDataforseoAnswer(outcome.result, task.engine);
  if (!answer) {
    await repo.failPendingObservations(
      runId,
      "DataForSEO returned an answer we could not read.",
      [task.tag],
    );
    return;
  }
  await saveAiAnswer(task.tag, answer, brands);
}

/** Saves one answer with its citations and brand results. */
async function saveAiAnswer(
  observationId: string,
  answer: ParsedAiAnswer,
  brands: AiBrand[],
) {
  await repo.persistAnswer({
    observationId,
    values: {
      status: "completed",
      collectedAt: answer.collectedAt ?? new Date().toISOString(),
      answerMarkdown: answer.answerMarkdown,
      error: null,
    },
    sources: answer.citations.map((citation) => ({
      id: crypto.randomUUID(),
      observationId,
      ...citation,
    })),
    matches: brands.map((brand) => ({
      id: crypto.randomUUID(),
      observationId,
      ...brand,
      ...matchAiBrand(answer, brand),
    })),
  });
}

/** Fails answers that never arrived and records how the run finished. */
export async function finalizeAiRun(runId: string) {
  const run = await repo.getRunInternal(runId);
  if (!run || run.status !== "running") return;
  await repo.failPendingObservations(
    runId,
    "No answer arrived within the collection window.",
  );
  const statuses = await repo.getObservationStatuses([runId]);
  const completed = statuses.filter((row) => row.status === "completed").length;
  const status =
    completed === statuses.length
      ? "completed"
      : completed > 0
        ? "partial"
        : "failed";
  await repo.updateRun(runId, {
    status,
    completedAt: new Date().toISOString(),
  });
  if (status !== "failed")
    await repo.updateTracker(run.trackerId, { lastSkipReason: null });
}

/** The workflow's failure path: fail the run and say why on the tracker. */
export async function markAiRunFailed(runId: string, error: unknown) {
  const message =
    error instanceof AppError && error.code === "INSUFFICIENT_CREDITS"
      ? "Not enough credits for the last check."
      : "The last check could not collect answers.";
  await failAiRun(runId, message);
  const run = await repo.getRunInternal(runId);
  if (run) await repo.updateTracker(run.trackerId, { lastSkipReason: message });
}
