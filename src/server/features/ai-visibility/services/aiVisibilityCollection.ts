import { NonRetryableError } from "cloudflare:workflows";
import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  createDataforseoClient,
  fetchAiTrackingTaskResult,
  MAX_TASKS_PER_POST,
  type AiTrackingAnswer,
  type PostedAiTrackingTask,
} from "@/server/lib/dataforseo";
import { DataforseoChargedTaskError } from "@/server/lib/dataforseo/envelope";
import { resolveLatestLlmModelName } from "@/server/lib/dataforseo/llm-models";
import { AppError, asAppError } from "@/server/lib/errors";
import type { ErrorCode } from "@/shared/error-codes";
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
import type { AiPostedHold } from "./aiVisibilityBilling";
import { aiBrands } from "./aiVisibilityConfiguration";
import { AI_ANSWER_FAILURES } from "./aiVisibilityErrors";
import { matchAiBrand } from "./aiVisibilityMatching";
import { recordAiRunOutcome } from "./aiVisibilityRunOutcome";

// Each function here is one workflow step body: inputs are its parameters and
// the return value is what the workflow engine persists and replays.

interface AiTask {
  /** The answer row id. */
  tag: string;
  prompt: string;
  /** Attempts already made, when a queued answer is posted again. */
  attempts?: number;
}
interface AiTaskBatch {
  engine: AiEngine;
  /** At most 100 per task_post, 6 per model batch. */
  tasks: AiTask[];
}
/** One live answer. A live step mixes engines, so each task names its own. */
type AiLiveTask = AiTask & { engine: AiEngine };
export type AiPendingTask = PostedAiTrackingTask &
  AiLiveTask & { attempts: number };
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
 * Attempts per answer. A new attempt follows only when DataForSEO returned the
 * task and its own backend failed it, so the failure and its cost are known. A
 * transport error or a timeout can hide a charge, so it is never retried.
 */
const AI_ANSWER_ATTEMPTS = 3;
/** Pause before a new attempt, so a short provider outage can clear. */
const AI_RETRY_DELAY_MS = 3_000;

const waitBeforeRetry = () =>
  new Promise((resolve) => setTimeout(resolve, AI_RETRY_DELAY_MS));

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Marks the run running and groups its answers into batches. Manual and
 * baseline runs collect live answers so the user sees results sooner.
 * Scheduled runs use the cheaper standard queue. Claude and Perplexity have no
 * LLM Scraper, so every run asks their model API (`modelBatches`). startRun
 * checked credits before the run was created.
 */
export async function prepareAiRun(
  runId: string,
): Promise<
  { market: AiRunMarket; modelBatches: AiTaskBatch[] } & (
    | { live: false; batches: AiTaskBatch[] }
    | { live: true; batches: AiLiveTask[][] }
  )
> {
  const run = await repo.getRunInternal(runId);
  // Stale-run cleanup failed it already; a retry would find the same.
  if (!run || (run.status !== "queued" && run.status !== "running"))
    throw new NonRetryableError(`Run ${runId} is no longer active.`);
  const pending = (await repo.getObservations([runId])).filter(
    (row) => row.status === "pending",
  );
  const live = run.trigger !== "scheduled";
  await repo.updateRun(runId, { status: "running" });
  const market = {
    locationCode: run.locationCode,
    languageCode: run.languageCode,
  };
  const tasks = pending.map((row) => ({
    tag: row.id,
    prompt: row.prompt,
    engine: row.engine,
  }));
  const modelBatches = engineBatches(
    tasks.filter((task) => aiEngineUsesModelApi(task.engine)),
    LIVE_ANSWERS_PER_STEP,
  );
  const answers = tasks.filter((task) => !aiEngineUsesModelApi(task.engine));
  if (live) {
    const batches: AiLiveTask[][] = [];
    for (let i = 0; i < answers.length; i += LIVE_ANSWERS_PER_STEP)
      batches.push(answers.slice(i, i + LIVE_ANSWERS_PER_STEP));
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
function engineBatches(answers: AiLiveTask[], size: number): AiTaskBatch[] {
  const batches: AiTaskBatch[] = [];
  for (const engine of new Set(answers.map((task) => task.engine))) {
    const tasks = answers
      .filter((task) => task.engine === engine)
      .map(({ tag, prompt, attempts }) => ({ tag, prompt, attempts }));
    for (let i = 0; i < tasks.length; i += size)
      batches.push({ engine, tasks: tasks.slice(i, i + size) });
  }
  return batches;
}

/**
 * Posts one batch through the metered client, which holds credits for it
 * until settleAiRun charges the answers that arrived. Answers the provider
 * did not accept fail now; the rest are collected later.
 */
export async function postAiBatch(
  runId: string,
  customer: BillingCustomerContext,
  market: AiRunMarket,
  batch: AiTaskBatch,
): Promise<{ pending: AiPendingTask[]; hold: AiPostedHold | null }> {
  let posted: PostedAiTrackingTask[] = [];
  let hold: AiPostedHold | null = null;
  // A rejected entry is logged where it is parsed.
  let error: ErrorCode = "INTERNAL_ERROR";
  try {
    const result = await createDataforseoClient(
      customer,
    ).aiSearch.trackingTaskPost({
      engine: batch.engine,
      tasks: batch.tasks,
      ...market,
    });
    posted = result.tasks;
    if (result.hold) hold = { ...result.hold, tasks: posted };
  } catch (cause) {
    error = asAppError(cause)?.code ?? "INTERNAL_ERROR";
    console.warn(`[ai-visibility] ${runId} task_post failed:`, cause);
  }
  const postedByTag = new Map(posted.map((task) => [task.tag, task]));
  const rejected = batch.tasks
    .map((task) => task.tag)
    .filter((tag) => !postedByTag.has(tag));
  if (rejected.length)
    await repo.failPendingObservations(runId, error, rejected);
  const pending = batch.tasks.flatMap((task) => {
    const postedTask = postedByTag.get(task.tag);
    if (!postedTask) return [];
    const attempts = (task.attempts ?? 0) + 1;
    return [{ ...task, ...postedTask, engine: batch.engine, attempts }];
  });
  return { pending, hold };
}

/**
 * Collects one batch of live answers through the metered client, which bills
 * them, and saves each one. An answer that DataForSEO's backend failed is
 * asked again, up to AI_ANSWER_ATTEMPTS.
 */
export async function collectAiLiveBatch(
  runId: string,
  customer: BillingCustomerContext,
  market: AiRunMarket,
  tasks: AiLiveTask[],
) {
  const brands = await runBrands(runId);
  if (!brands) return;
  let remaining = tasks;
  for (let attempt = 1; remaining.length > 0; attempt++) {
    if (attempt > 1) await waitBeforeRetry();
    const answers = await fetchLiveAnswers(customer, market, remaining);
    const retry: AiLiveTask[] = [];
    for (const [index, result] of answers.entries()) {
      const task = remaining[index];
      if (
        result.status === "failed" &&
        result.retryable &&
        attempt < AI_ANSWER_ATTEMPTS
      ) {
        retry.push(task);
        continue;
      }
      // Every answer here is already paid for, and the step cannot rerun, so
      // one failed write must not drop the rest. finalizeAiRun fails the
      // answer that stays pending.
      try {
        await saveAiOutcome(runId, task, result, brands);
      } catch (error) {
        console.error(
          `[ai-visibility] ${runId} could not save answer ${task.tag}:`,
          error,
        );
      }
    }
    remaining = retry;
  }
}

/** A call that throws becomes a failed answer that is not retried. */
async function fetchLiveAnswers(
  customer: BillingCustomerContext,
  market: AiRunMarket,
  tasks: AiLiveTask[],
): Promise<AiTrackingAnswer[]> {
  let settled: PromiseSettledResult<AiTrackingAnswer>[];
  try {
    settled = await createDataforseoClient(customer).aiSearch.trackingLiveBatch(
      tasks.map((task) => ({ engine: task.engine, task, ...market })),
    );
  } catch (error) {
    settled = tasks.map(() => ({ status: "rejected", reason: error }));
  }
  return settled.map((outcome) =>
    outcome.status === "fulfilled"
      ? outcome.value
      : {
          status: "failed",
          message: errorMessage(outcome.reason),
          code: asAppError(outcome.reason)?.code ?? "INTERNAL_ERROR",
          retryable: false,
        },
  );
}

/**
 * Asks each prompt of a Claude or Perplexity batch through the metered model
 * API client, which bills each answer, and saves each answer as soon as it
 * arrives, so a slow call that hits the step timeout cannot discard answers
 * already paid for. An answer that DataForSEO's backend failed is asked again,
 * up to AI_ANSWER_ATTEMPTS. Model answers have no language setting: only the
 * country guides the web search.
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
      for (let attempt = 1; ; attempt++) {
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
          return;
        } catch (cause) {
          // A charged task error is a task DataForSEO returned with its cost.
          if (
            cause instanceof DataforseoChargedTaskError &&
            cause.code === "UPSTREAM_UNAVAILABLE" &&
            attempt < AI_ANSWER_ATTEMPTS
          ) {
            await waitBeforeRetry();
            continue;
          }
          console.warn(
            `[ai-visibility] ${runId} answer ${task.tag} failed:`,
            cause,
          );
          const code = asAppError(cause)?.code ?? "INTERNAL_ERROR";
          await repo.failPendingObservations(runId, code, [task.tag]);
          return;
        }
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
 * with their citations and brand results. Returns the tasks still pending, and
 * the answers DataForSEO's backend failed that `canRetry` lets the caller post
 * again.
 */
export async function collectAiRound(
  runId: string,
  tasks: AiPendingTask[],
  canRetry: boolean,
): Promise<{ pending: AiPendingTask[]; retry: AiTaskBatch[] }> {
  const brands = await runBrands(runId);
  if (!brands) return { pending: [], retry: [] };
  // A retried or timed-out step hands back answers an earlier attempt already
  // saved or failed. Skip them, so each attempt continues where the last one
  // stopped instead of saving every answer again.
  const stillPending = new Set(await repo.listPendingObservationIds(runId));
  const unsaved = tasks.filter((task) => stillPending.has(task.tag));
  const pending: AiPendingTask[] = [];
  const retry: AiPendingTask[] = [];
  await readAiTasks(unsaved, async (task, result) => {
    if (result.status === "pending") return pending.push(task);
    if (
      canRetry &&
      result.status === "failed" &&
      result.retryable &&
      task.attempts < AI_ANSWER_ATTEMPTS
    )
      return retry.push(task);
    await saveAiOutcome(runId, task, result, brands);
  });
  return { pending, retry: engineBatches(retry, MAX_TASKS_PER_POST) };
}

/**
 * Reads answers that missed the collection window, after the run finished
 * (task_get stays free for 30 days), and saves the ones DataForSEO has since
 * returned, so a provider delay fills the run in late. Returns the tasks still
 * missing.
 */
export async function collectLateAiAnswers(
  runId: string,
  tasks: AiPendingTask[],
): Promise<AiPendingTask[]> {
  const brands = await runBrands(runId);
  if (!brands) return [];
  const missing = new Set(
    await repo.listFailedObservationIds(runId, AI_ANSWER_FAILURES.notArrived),
  );
  const pending: AiPendingTask[] = [];
  await readAiTasks(
    tasks.filter((task) => missing.has(task.tag)),
    async (task, result) => {
      if (result.status === "pending") return pending.push(task);
      // DataForSEO failed it: the answer keeps its not-arrived message.
      if (result.status === "failed") return;
      await saveAiOutcome(runId, task, result, brands);
    },
  );
  // Every read, not only one that saved: a retried step skips the answers an
  // earlier attempt saved before failing here.
  await recordAiRunOutcome(runId);
  return pending;
}

/**
 * Reads each task once (task_get is free), a chunk at a time, and hands each
 * result over as it comes. A failed read counts as pending, to be read again.
 */
async function readAiTasks(
  tasks: AiPendingTask[],
  onResult: (
    task: AiPendingTask,
    result: Awaited<ReturnType<typeof fetchAiTrackingTaskResult>>,
  ) => Promise<unknown>,
) {
  for (let i = 0; i < tasks.length; i += TASK_GET_CONCURRENCY) {
    const chunk = tasks.slice(i, i + TASK_GET_CONCURRENCY);
    const outcomes = await Promise.allSettled(
      chunk.map((task) => fetchAiTrackingTaskResult(task)),
    );
    for (const [index, outcome] of outcomes.entries())
      await onResult(
        chunk[index],
        outcome.status === "fulfilled" ? outcome.value : { status: "pending" },
      );
  }
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
    console.warn(
      `[ai-visibility] ${runId} answer ${task.tag} failed: ${outcome.message}`,
    );
    await repo.failPendingObservations(runId, outcome.code, [task.tag]);
    return;
  }
  const answer = parseDataforseoAnswer(outcome.result, task.engine);
  if (!answer) {
    console.error(
      `[ai-visibility] ${runId} answer ${task.tag} has a shape we cannot read`,
    );
    await repo.failPendingObservations(runId, "INTERNAL_ERROR", [task.tag]);
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
