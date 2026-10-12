import { dataforseoGet, dataforseoPost } from "@/server/lib/dataforseo/core";
import { MAX_TASKS_PER_POST } from "@/server/lib/dataforseo/shared";
import {
  isNoResultsTask,
  isTaskInProgress,
  type DataforseoApiResponse,
  type DataforseoTaskLike,
} from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";
import {
  aiEngineUsesModelApi,
  type AiEngine,
  type AiModelApiEngine,
} from "@/shared/ai-visibility";

// AI visibility tracking endpoints. Scheduled runs use the standard queue:
// task_post, then a free task_get/advanced by task ID. Manual runs use
// live/advanced, one prompt per call.
// https://docs.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/overview/
// https://docs.dataforseo.com/v3/serp/google/organic/overview/
const AI_TRACKING_ENDPOINTS: Record<
  Exclude<AiEngine, AiModelApiEngine>,
  string
> = {
  chatgpt: "/v3/ai_optimization/chat_gpt/llm_scraper",
  gemini: "/v3/ai_optimization/gemini/llm_scraper",
  google_ai_overview: "/v3/serp/google/organic",
};

/** Live engines have no LLM Scraper: their answers come from the live API. */
function trackingEndpoint(engine: AiEngine): string {
  if (aiEngineUsesModelApi(engine))
    throw new AppError("INTERNAL_ERROR", `${engine} answers cannot be queued`);
  return AI_TRACKING_ENDPOINTS[engine];
}

interface AiTrackingTaskInput {
  /** Echoed back by DataForSEO; maps a task to its answer row. */
  tag: string;
  prompt: string;
}

interface AiTrackingMarket {
  locationCode: number;
  languageCode: string;
}

// Live answers can take up to 120 seconds.
const LIVE_REQUEST_TIMEOUT_MS = 150_000;

export interface PostedAiTrackingTask {
  tag: string;
  taskId: string;
}

/**
 * The LLM Scraper language lists name three project-market languages
 * differently, and Gemini only offers Brazilian Portuguese. The organic
 * SERP uses the project-market codes.
 */
function providerLanguageCode(engine: AiEngine, languageCode: string) {
  if (engine === "google_ai_overview") return languageCode;
  if (languageCode === "nb") return "no";
  if (languageCode === "tl") return "fil";
  if (languageCode === "pt" && engine !== "chatgpt") return "pt-BR";
  return languageCode;
}

function aiTrackingTaskBody(
  engine: AiEngine,
  market: AiTrackingMarket,
  task: AiTrackingTaskInput,
) {
  return {
    // DataForSEO decodes %-escapes in keywords; escape literal % and +.
    keyword: task.prompt.replace(/%/g, "%25").replace(/\+/g, "%2B"),
    location_code: market.locationCode,
    language_code: providerLanguageCode(engine, market.languageCode),
    // Loads an overview that Google renders after the page. DataForSEO
    // refunds the extra charge when no overview loads.
    ...(engine === "google_ai_overview"
      ? { depth: 10, load_async_ai_overview: true }
      : {}),
    tag: task.tag,
  };
}

/**
 * Posts up to 100 prompts for one engine. DataForSEO bills at task_post, so
 * this is the metered call. Rejected entries come back without a task; the
 * caller fails their answers.
 */
export async function postAiTrackingTasks(
  input: AiTrackingMarket & {
    engine: AiEngine;
    tasks: AiTrackingTaskInput[];
  },
): Promise<DataforseoApiResponse<PostedAiTrackingTask[]>> {
  if (input.tasks.length === 0 || input.tasks.length > MAX_TASKS_PER_POST) {
    throw new AppError(
      "INTERNAL_ERROR",
      `task_post accepts 1-${MAX_TASKS_PER_POST} tasks, got ${input.tasks.length}`,
    );
  }
  const endpoint = trackingEndpoint(input.engine);
  const response = await dataforseoPost<
    DataforseoTaskLike & { id?: string; data?: Record<string, unknown> }
  >(
    `${endpoint}/task_post`,
    input.tasks.map((task) => aiTrackingTaskBody(input.engine, input, task)),
    // A billed task_post must never be replayed on an ambiguous 5xx.
    { maxServerErrorRetries: 0 },
  );
  if (!response || response.status_code !== 20000) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message || "DataForSEO task_post failed",
    );
  }
  // Cost is summed over every entry, accepted or not, so anything DataForSEO
  // charged is metered.
  const posted: PostedAiTrackingTask[] = [];
  let costUsd = 0;
  for (const entry of response.tasks ?? []) {
    costUsd += entry.cost ?? 0;
    const tag: unknown = entry.data?.tag;
    if (entry.status_code !== 20100 || !entry.id || typeof tag !== "string") {
      console.warn(
        `dataforseo.ai_tracking.task_post.rejected-entry (${entry.status_code}): ${entry.status_message}`,
      );
      continue;
    }
    posted.push({ tag, taskId: entry.id });
  }
  return {
    data: posted,
    billing: {
      path: `${endpoint}/task_post`.slice(1).split("/"),
      costUsd,
    },
  };
}

export type AiTrackingAnswer =
  | { status: "failed"; message: string }
  /** `result` is null when Google returned no results page. */
  | { status: "completed"; result: unknown };
type AiTrackingTaskOutcome = { status: "pending" } | AiTrackingAnswer;

/**
 * Collects one queued answer. Not metered, like fetchRankCheckTaskResult: the
 * task was charged at task_post.
 */
export async function fetchAiTrackingTaskResult(input: {
  engine: AiEngine;
  taskId: string;
}): Promise<AiTrackingTaskOutcome> {
  const response = await dataforseoGet(
    `${trackingEndpoint(input.engine)}/task_get/advanced/${encodeURIComponent(input.taskId)}`,
  );
  const task = response?.tasks?.[0];
  if (!response || response.status_code !== 20000 || !task) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message || "DataForSEO task_get failed",
    );
  }
  if (isTaskInProgress(task)) return { status: "pending" };
  return aiTrackingAnswer(task);
}

function aiTrackingAnswer(
  task: DataforseoTaskLike & { result?: unknown[] | null },
): AiTrackingAnswer {
  if (task.status_code !== 20000) {
    if (isNoResultsTask(task)) return { status: "completed", result: null };
    return {
      status: "failed",
      message:
        task.status_message || `DataForSEO task failed (${task.status_code})`,
    };
  }
  return { status: "completed", result: task.result?.[0] ?? null };
}

/**
 * Fetches one answer from the live endpoint. DataForSEO bills each live call,
 * so this is the metered call. A failed task returns a failed outcome with
 * its charge, so the caller fails only that answer.
 */
export async function fetchAiTrackingLiveAnswer(
  input: AiTrackingMarket & {
    engine: AiEngine;
    task: AiTrackingTaskInput;
  },
): Promise<DataforseoApiResponse<AiTrackingAnswer>> {
  const endpoint = `${trackingEndpoint(input.engine)}/live/advanced`;
  const response = await dataforseoPost<
    DataforseoTaskLike & { result?: unknown[] | null }
  >(endpoint, [aiTrackingTaskBody(input.engine, input, input.task)], {
    // A billed live call must never be replayed on an ambiguous 5xx.
    maxServerErrorRetries: 0,
    signal: AbortSignal.timeout(LIVE_REQUEST_TIMEOUT_MS),
  });
  const task = response?.tasks?.[0];
  if (!response || response.status_code !== 20000 || !task) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message || "DataForSEO live request failed",
    );
  }
  return {
    data: aiTrackingAnswer(task),
    billing: { path: endpoint.slice(1).split("/"), costUsd: task.cost ?? 0 },
  };
}
