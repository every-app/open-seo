/* eslint-disable max-lines -- one file per DataForSEO section (see index.ts); SERP spans live, rank-check, merged-read and Maps queue calls */
import { z } from "zod";
import { isGoogleRedirect } from "@/shared/google-serp-url";
import { dataforseoGet, dataforseoPost } from "@/server/lib/dataforseo/core";
import { MAX_TASKS_PER_POST } from "@/server/lib/dataforseo/shared";
import {
  assertOk,
  buildTaskBilling,
  DataforseoChargedTaskError,
  invalidFieldName,
  isNoResultsTask,
  isTaskInProgress,
  parseTaskItems,
  type DataforseoApiResponse,
  type DataforseoItemsTask,
  type DataforseoTaskLike,
  failedResponseError,
} from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";

// Default depth for a single SERP. DataForSEO crawls (and bills) one Google
// page of 10 results at a time, so depth is a lever on both latency and cost.
// Page 1 keeps three merged reads at about the price of one two-page read, and
// the merge returns about as many sites. Callers that need to see deeper ranks
// pass an explicit depth. There is no offset/cursor: a deeper request re-crawls
// pages 1..N/10 from the top, so it replaces the shallow snapshot rather than
// extending it.
export const SERP_ANALYSIS_DEPTH = 10;

/** High priority finishes in ~10-40 s; the normal queue takes minutes. */
const TASK_PRIORITY_HIGH = 2;

/** DataForSEO bills SERPs in pages of 10; depth outside 10-100 is rejected. */
export function clampSerpDepth(depth: number): number {
  return Math.min(100, Math.max(10, depth));
}

// Kept as a hand-written schema: the SDK's BaseSerpApiElementItem type omits
// etv / estimated_paid_traffic_cost / backlinks_info / rank_changes, which we
// rely on. The fields survive deserialization (the SDK copies unknown keys), so
// validating here is both our type-safety guard and how we read those fields.
export const serpSnapshotItemSchema = z
  .object({
    type: z.string(),
    rank_group: z.number().nullable().optional(),
    rank_absolute: z.number().nullable().optional(),
    domain: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    breadcrumb: z.string().nullable().optional(),
    etv: z.number().nullable().optional(),
    estimated_paid_traffic_cost: z.number().nullable().optional(),
    backlinks_info: z
      .object({
        referring_domains: z.number().nullable().optional(),
        backlinks: z.number().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    rank_changes: z
      .object({
        previous_rank_absolute: z.number().nullable().optional(),
        is_new: z.boolean().nullable().optional(),
        is_up: z.boolean().nullable().optional(),
        is_down: z.boolean().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough()
  .transform(unwrapGoogleRedirect);

/**
 * Google wraps many organic results in a google.com/goto redirect, and
 * DataForSEO reports them with domain "google.com" and an encoded URL. The
 * real site is only in the breadcrumb ("https://www.runnersworld.com › gear").
 * When the breadcrumb isn't a URL (Reddit's "230+ comments") the domain is
 * unknown, which beats crediting google.com with the result.
 */
function unwrapGoogleRedirect<
  T extends { url?: string | null; breadcrumb?: string | null },
>(item: T): T & { domain?: string | null } {
  if (!item.url || !isGoogleRedirect(item.url)) return item;
  return { ...item, domain: breadcrumbHost(item.breadcrumb) };
}

function breadcrumbHost(breadcrumb: string | null | undefined): string | null {
  const first = breadcrumb?.split("›")[0]?.trim();
  if (!first || !/^https?:\/\//i.test(first)) return null;
  try {
    return new URL(first).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export type SerpLiveItem = z.infer<typeof serpSnapshotItemSchema>;

export interface SerpQuery {
  keyword: string;
  locationCode: number;
  languageCode: string;
  depth?: number;
  /** Canonical DataForSEO name of a city, county, or region for a local SERP. */
  locationName?: string;
  device?: "desktop" | "mobile";
}

function serpQueryParams(input: SerpQuery) {
  const device = input.device ?? "desktop";
  const locationParams = input.locationName
    ? { location_name: input.locationName }
    : { location_code: input.locationCode };
  return {
    keyword: input.keyword,
    ...locationParams,
    language_code: input.languageCode,
    device,
    os: device === "desktop" ? "windows" : "android",
    depth: clampSerpDepth(input.depth ?? SERP_ANALYSIS_DEPTH),
  };
}

export async function fetchLiveSerp(
  input: SerpQuery,
): Promise<DataforseoApiResponse<SerpLiveItem[]>> {
  const response = await dataforseoPost(
    "/v3/serp/google/organic/live/advanced",
    [serpQueryParams(input)],
  );
  // DataForSEO uses a task error for a valid empty SERP. Keep the charged
  // response in the normal billing path and return an empty item list.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: parseTaskItems(
      "google-organic-live-advanced",
      task,
      serpSnapshotItemSchema,
    ),
    billing: buildTaskBilling(task),
  };
}

export interface RankCheckResult {
  keywordId: string;
  keyword: string;
  position: number | null;
  url: string | null;
  serpFeatures: string[];
}

function buildRankCheckResult(
  input: { keywordId: string; keyword: string; targetDomain: string },
  items: SerpLiveItem[],
): RankCheckResult {
  const target = input.targetDomain.toLowerCase();
  const organicMatch = items.find((item) => {
    if (item.type !== "organic" || item.domain == null) return false;
    const domain = item.domain.toLowerCase();
    return domain === target || domain.endsWith(`.${target}`);
  });

  return {
    keywordId: input.keywordId,
    keyword: input.keyword,
    // rank_group = position among organic results only (what users count as
    // "my ranking"). rank_absolute would also count SERP features (local
    // pack, PAA, AI overviews) and reads as worse than what users see.
    position: organicMatch
      ? (organicMatch.rank_group ?? organicMatch.rank_absolute ?? null)
      : null,
    url: organicMatch?.url ?? null,
    serpFeatures: [...new Set(items.map((item) => item.type).filter(Boolean))],
  };
}

// ---------------------------------------------------------------------------
// Task-queue rank checks. DataForSEO's standard queue costs ~30% of the live
// endpoint, resolves google.com/goto results, and tasks complete in ~5 minutes
// on average. The flow is task_post (charged) -> poll task_get (free),
// orchestrated by the rank check workflow.
// ---------------------------------------------------------------------------

export interface RankCheckTaskInput {
  keyword: string;
  keywordId: string;
  device: "desktop" | "mobile";
}

export interface PostedRankCheckTask extends RankCheckTaskInput {
  taskId: string;
}

export async function postRankCheckTasks(input: {
  tasks: RankCheckTaskInput[];
  locationCode: number;
  languageCode: string;
  locationName?: string;
  depth: number;
}): Promise<DataforseoApiResponse<PostedRankCheckTask[]>> {
  if (input.tasks.length === 0 || input.tasks.length > MAX_TASKS_PER_POST) {
    throw new AppError(
      "INTERNAL_ERROR",
      `task_post accepts 1-${MAX_TASKS_PER_POST} tasks, got ${input.tasks.length}`,
    );
  }
  const depth = clampSerpDepth(input.depth);
  const locationParams = input.locationName
    ? { location_name: input.locationName }
    : { location_code: input.locationCode };
  const response = await dataforseoPost<
    DataforseoTaskLike & { id?: string; data?: Record<string, unknown> }
  >(
    "/v3/serp/google/organic/task_post",
    input.tasks.map((task) => ({
      keyword: task.keyword,
      ...locationParams,
      language_code: input.languageCode,
      device: task.device,
      os: task.device === "desktop" ? "windows" : "android",
      depth,
      // Echoed back on the response entry and task_get; used to map a
      // DataForSEO task id back to our keyword without relying on order.
      tag: `${task.keywordId}:${task.device}`,
    })),
  );

  if (!response || response.status_code !== 20000) {
    throw failedResponseError(response, "DataForSEO task_post failed");
  }

  // One response entry per submitted task; accepted entries have status 20100
  // "Task Created" and their own cost (charged at post time). Cost is summed
  // over every entry — accepted or not — so anything DataForSEO charged is
  // metered. Rejected entries get no posted task, so that read has no result.
  const byTag = new Map(
    input.tasks.map((task) => [`${task.keywordId}:${task.device}`, task]),
  );
  const posted: PostedRankCheckTask[] = [];
  let costUsd = 0;
  for (const entry of response.tasks ?? []) {
    costUsd += entry.cost ?? 0;
    const tag: unknown = entry.data?.tag;
    const task = typeof tag === "string" ? byTag.get(tag) : undefined;
    if (entry.status_code !== 20100 || !entry.id || !task) {
      console.warn(
        `dataforseo.task_post.rejected-entry (${entry.status_code}): ${entry.status_message}`,
      );
      continue;
    }
    posted.push({ ...task, taskId: entry.id });
  }

  return {
    data: posted,
    billing: {
      path: ["v3", "serp", "google", "organic", "task_post"],
      costUsd,
    },
  };
}

type RankCheckTaskOutcome =
  | { status: "pending" }
  | { status: "failed"; message: string }
  | { status: "completed"; result: RankCheckResult };

/**
 * Collect one queued task's result. Deliberately not metered and not wrapped
 * in the billing envelope: collection is free (the task was charged at
 * task_post), so running it through the metering seam would charge the customer
 * twice.
 */
export async function fetchRankCheckTaskResult(input: {
  taskId: string;
  keywordId: string;
  keyword: string;
  targetDomain: string;
}): Promise<RankCheckTaskOutcome> {
  const outcome = await fetchSerpTaskResult(input.taskId);
  if (outcome.status !== "completed") return outcome;
  return {
    status: "completed",
    result: buildRankCheckResult(input, outcome.items),
  };
}

type SerpTaskOutcome =
  | { status: "pending" }
  | { status: "failed"; message: string }
  | { status: "completed"; items: SerpLiveItem[] };

/** Collects one queued organic SERP task. Free, so not metered (see above). */
export async function fetchSerpTaskResult(
  taskId: string,
  signal?: AbortSignal,
): Promise<SerpTaskOutcome> {
  const response = await dataforseoGet(
    `/v3/serp/google/organic/task_get/advanced/${encodeURIComponent(taskId)}`,
    { signal },
  );
  const task = response?.tasks?.[0];
  if (!response || response.status_code !== 20000 || !task) {
    throw failedResponseError(response, "DataForSEO task_get failed");
  }

  if (isTaskInProgress(task)) {
    return { status: "pending" };
  }

  if (task.status_code !== 20000) {
    // "No Search Results" is valid for obscure/new keywords — same treatment
    // as the live path's treatNoResultsAsEmpty.
    if (!isNoResultsTask(task)) {
      return {
        status: "failed",
        message:
          task.status_message || `DataForSEO task failed (${task.status_code})`,
      };
    }
    return { status: "completed", items: [] };
  }

  return {
    status: "completed",
    items: parseTaskItems(
      "google-organic-task-get-advanced",
      task,
      serpSnapshotItemSchema,
    ),
  };
}

// ---------------------------------------------------------------------------
// Merged single SERPs. Google serves scrapers poisoned pages, and nothing in a
// response marks one, so a single SERP request reads the page several times
// and merges the reads. All reads go out in one high-priority task_post, so
// DataForSEO runs them in parallel; collection through task_get is free.
// ---------------------------------------------------------------------------

export const SERP_READS_PER_QUERY = 3;

/**
 * Posts one query's reads and returns the accepted task ids. Not retried on a
 * 5xx, which does not prove the post went unbilled.
 */
export async function postSerpReadTasks(
  input: SerpQuery,
): Promise<DataforseoApiResponse<string[]>> {
  const response = await dataforseoPost<
    DataforseoTaskLike & { id?: string; data?: Record<string, unknown> }
  >(
    "/v3/serp/google/organic/task_post",
    Array.from({ length: SERP_READS_PER_QUERY }, () => ({
      ...serpQueryParams(input),
      priority: TASK_PRIORITY_HIGH,
    })),
    { maxServerErrorRetries: 0 },
  );
  if (!response || response.status_code !== 20000) {
    throw failedResponseError(response, "DataForSEO task_post failed");
  }

  // Cost is summed over every entry, accepted or not, so anything DataForSEO
  // charged is metered.
  const taskIds: string[] = [];
  let costUsd = 0;
  for (const entry of response.tasks ?? []) {
    costUsd += entry.cost ?? 0;
    if (entry.status_code === 20100 && entry.id) {
      taskIds.push(entry.id);
    } else {
      console.warn(
        `dataforseo.task_post.rejected-entry (${entry.status_code}): ${entry.status_message}`,
      );
    }
  }
  const billing = {
    path: ["v3", "serp", "google", "organic", "task_post"],
    costUsd,
  };
  if (taskIds.length === 0) {
    // Charged-task error, so the meter still bills whatever DataForSEO
    // charged, and an uncharged invalid request reads as a validation error.
    const message =
      response.tasks?.[0]?.status_message || "DataForSEO created no tasks";
    throw new DataforseoChargedTaskError(
      message,
      billing,
      invalidFieldName(message) !== null,
    );
  }
  return { data: taskIds, billing };
}

export async function fetchLocalSerp(input: {
  keyword: string;
  locationCoordinate?: string;
  /** A DataForSEO location name, for a search across a whole city. */
  locationName?: string;
  languageCode: string;
  searchType: "maps" | "local_finder";
  device: "desktop" | "mobile";
  depth: number;
  searchPlaces?: boolean;
}): Promise<DataforseoApiResponse<Record<string, unknown>[]>> {
  const os = input.device === "desktop" ? "windows" : "android";

  if (input.searchType === "maps") {
    const response = await dataforseoPost<
      DataforseoItemsTask<Record<string, unknown>>
    >("/v3/serp/google/maps/live/advanced", [
      {
        keyword: input.keyword,
        location_coordinate: input.locationCoordinate,
        location_name: input.locationName,
        language_code: input.languageCode,
        device: input.device,
        os,
        depth: input.depth,
        search_places: input.searchPlaces,
      },
    ]);
    // 40501 = billed empty SERP; DataForSEO returns it for some coordinate-only
    // Maps and Local Finder queries (both paths below opt in).
    const task = assertOk(response, { treatNoResultsAsEmpty: true });
    return {
      data: task.result?.[0]?.items ?? [],
      billing: buildTaskBilling(task),
    };
  }

  const response = await dataforseoPost<
    DataforseoItemsTask<Record<string, unknown>>
  >("/v3/serp/google/local_finder/live/advanced", [
    {
      keyword: input.keyword,
      location_coordinate: input.locationCoordinate,
      location_name: input.locationName,
      language_code: input.languageCode,
      device: input.device,
      os,
      depth: input.depth,
    },
  ]);
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: task.result?.[0]?.items ?? [],
    billing: buildTaskBilling(task),
  };
}

// ---------------------------------------------------------------------------
// Task-queue Maps searches (local rank grids). One task_post carries every
// grid point, so DataForSEO runs the searches in parallel instead of a Worker
// request waiting on them six at a time, and at the queue's lower price.
// Collection through task_get is free.
// ---------------------------------------------------------------------------

/**
 * Posts one Maps task per coordinate and returns the task ids in input
 * order, null where DataForSEO rejected an entry. Not retried on a 5xx,
 * which does not prove the post went unbilled.
 */
export async function postLocalSerpTasks(input: {
  keyword: string;
  locationCoordinates: string[];
  languageCode: string;
  device: "desktop" | "mobile";
  depth: number;
}): Promise<DataforseoApiResponse<Array<string | null>>> {
  const response = await dataforseoPost<
    DataforseoTaskLike & { id?: string; data?: Record<string, unknown> }
  >(
    "/v3/serp/google/maps/task_post",
    input.locationCoordinates.map((coordinate, index) => ({
      keyword: input.keyword,
      location_coordinate: coordinate,
      language_code: input.languageCode,
      device: input.device,
      os: input.device === "desktop" ? "windows" : "android",
      depth: input.depth,
      search_places: false,
      priority: TASK_PRIORITY_HIGH,
      // Echoed back on each entry, so ids map to points without relying on
      // response order.
      tag: String(index),
    })),
    { maxServerErrorRetries: 0 },
  );
  if (!response || response.status_code !== 20000) {
    throw failedResponseError(response, "DataForSEO task_post failed");
  }

  // Cost is summed over every entry, accepted or not, so anything DataForSEO
  // charged is metered.
  const taskIds: Array<string | null> = input.locationCoordinates.map(
    () => null,
  );
  let costUsd = 0;
  for (const entry of response.tasks ?? []) {
    costUsd += entry.cost ?? 0;
    const index = Number(entry.data?.tag);
    if (entry.status_code === 20100 && entry.id && taskIds[index] === null) {
      taskIds[index] = entry.id;
    } else {
      console.warn(
        `dataforseo.task_post.rejected-entry (${entry.status_code}): ${entry.status_message}`,
      );
    }
  }
  const billing = {
    path: ["v3", "serp", "google", "maps", "task_post"],
    costUsd,
  };
  if (taskIds.every((id) => id === null)) {
    // Charged-task error, so the meter still bills whatever DataForSEO
    // charged, and an uncharged invalid request reads as a validation error.
    const message =
      response.tasks?.[0]?.status_message || "DataForSEO created no tasks";
    throw new DataforseoChargedTaskError(
      message,
      billing,
      invalidFieldName(message) !== null,
    );
  }
  return { data: taskIds, billing };
}

export type LocalSerpTaskOutcome =
  | { status: "pending" }
  | { status: "failed"; message: string }
  | { status: "completed"; items: Record<string, unknown>[] };

/**
 * Collects one queued Maps task. Not metered, like fetchRankCheckTaskResult:
 * the task was charged at task_post.
 */
export async function fetchLocalSerpTaskResult(
  taskId: string,
): Promise<LocalSerpTaskOutcome> {
  const response = await dataforseoGet<
    DataforseoItemsTask<Record<string, unknown>>
  >(`/v3/serp/google/maps/task_get/advanced/${encodeURIComponent(taskId)}`);
  const task = response?.tasks?.[0];
  if (!response || response.status_code !== 20000 || !task) {
    throw failedResponseError(response, "DataForSEO task_get failed");
  }

  if (isTaskInProgress(task)) return { status: "pending" };
  if (task.status_code !== 20000) {
    // "No Search Results" is a billed empty SERP, as on the live path.
    if (isNoResultsTask(task)) return { status: "completed", items: [] };
    return {
      status: "failed",
      message:
        task.status_message || `DataForSEO task failed (${task.status_code})`,
    };
  }
  return { status: "completed", items: task.result?.[0]?.items ?? [] };
}
