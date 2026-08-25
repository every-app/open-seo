import { z } from "zod";
import { SerpGoogleMapsTaskPostRequestInfo } from "dataforseo-client";
import { serpApi, serpTaskApi } from "@/server/lib/dataforseo/core";
import {
  isNoResultsTask,
  parseTaskItems,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";
import { MAX_TASKS_PER_POST } from "@/server/lib/dataforseo/shared";
import { AppError } from "@/server/lib/errors";

const localGridMapItemSchema = z
  .object({
    type: z.string(),
    rank_group: z.number().nullable().optional(),
    rank_absolute: z.number().nullable().optional(),
    title: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    place_id: z.string().nullable().optional(),
    cid: z.string().nullable().optional(),
    feature_id: z.string().nullable().optional(),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    rating: z
      .object({
        value: z.number().nullable().optional(),
        votes_count: z.number().nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

type LocalGridMapItem = z.infer<typeof localGridMapItemSchema>;

interface LocalGridTaskInput {
  resultId: string;
  pointId: string;
  keywordId: string;
  keyword: string;
  locationCoordinate: string;
}

export interface PostedLocalGridTask extends LocalGridTaskInput {
  taskId: string;
  costUsd: number;
}

interface LocalGridRankingResult {
  rank: number;
  placeId: string | null;
  cid: string | null;
  featureId: string | null;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  primaryCategory: string | null;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
  reviewCount: number | null;
}

export interface CompletedLocalGridTask {
  resultId: string;
  pointId: string;
  keywordId: string;
  keyword: string;
  targetRank: number | null;
  matchedBy: "place_id" | "cid" | "feature_id" | "none";
  rankings: LocalGridRankingResult[];
}

function gridRankingFromItem(
  item: LocalGridMapItem,
): LocalGridRankingResult | null {
  if (item.type !== "maps_search" || !item.title) return null;
  const rank = item.rank_group ?? item.rank_absolute;
  if (rank == null || rank < 1) return null;
  return {
    rank,
    placeId: item.place_id ?? null,
    cid: item.cid ?? null,
    featureId: item.feature_id ?? null,
    name: item.title,
    address: item.address ?? null,
    phone: item.phone ?? null,
    website: item.url ?? item.domain ?? null,
    primaryCategory: item.category ?? null,
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
    rating: item.rating?.value ?? null,
    reviewCount: item.rating?.votes_count ?? null,
  };
}

function buildLocalGridTaskResult(
  input: LocalGridTaskInput & {
    target: {
      placeId?: string | null;
      cid?: string | null;
      featureId?: string | null;
    };
  },
  items: LocalGridMapItem[],
): CompletedLocalGridTask {
  const rankings = items
    .map(gridRankingFromItem)
    .filter((row): row is LocalGridRankingResult => row !== null)
    .toSorted((a, b) => a.rank - b.rank);
  const match = rankings.find((row) =>
    input.target.placeId && row.placeId === input.target.placeId
      ? true
      : input.target.cid && row.cid === input.target.cid
        ? true
        : Boolean(
            input.target.featureId && row.featureId === input.target.featureId,
          ),
  );
  const matchedBy = !match
    ? "none"
    : input.target.placeId && match.placeId === input.target.placeId
      ? "place_id"
      : input.target.cid && match.cid === input.target.cid
        ? "cid"
        : "feature_id";

  return {
    resultId: input.resultId,
    pointId: input.pointId,
    keywordId: input.keywordId,
    keyword: input.keyword,
    targetRank: match?.rank ?? null,
    matchedBy,
    rankings,
  };
}

export async function postLocalGridTasks(input: {
  tasks: LocalGridTaskInput[];
  languageCode: string;
  seDomain: string | null;
  depth: number;
  searchPlaces: boolean;
}): Promise<DataforseoApiResponse<PostedLocalGridTask[]>> {
  if (input.tasks.length === 0 || input.tasks.length > MAX_TASKS_PER_POST) {
    throw new AppError(
      "INTERNAL_ERROR",
      `task_post accepts 1-${MAX_TASKS_PER_POST} tasks, got ${input.tasks.length}`,
    );
  }

  const response = await serpTaskApi().googleMapsTaskPost(
    input.tasks.map(
      (task) =>
        new SerpGoogleMapsTaskPostRequestInfo({
          keyword: task.keyword,
          location_coordinate: task.locationCoordinate,
          language_code: input.languageCode,
          ...(input.seDomain ? { se_domain: input.seDomain } : {}),
          device: "desktop",
          os: "windows",
          depth: input.depth,
          search_this_area: true,
          search_places: input.searchPlaces,
          priority: 1,
          tag: task.resultId,
        }),
    ),
  );

  if (!response || response.status_code !== 20000) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message || "DataForSEO Maps task_post failed",
    );
  }

  const byResultId = new Map(input.tasks.map((task) => [task.resultId, task]));
  const posted: PostedLocalGridTask[] = [];
  let costUsd = 0;
  for (const entry of response.tasks ?? []) {
    costUsd += entry.cost ?? 0;
    const tag: unknown = entry.data?.tag;
    const source = typeof tag === "string" ? byResultId.get(tag) : undefined;
    if (entry.status_code !== 20100 || !entry.id || !source) continue;
    posted.push({ ...source, taskId: entry.id, costUsd: entry.cost ?? 0 });
  }

  return {
    data: posted,
    billing: {
      path: ["v3", "serp", "google", "maps", "task_post"],
      costUsd,
    },
  };
}

type LocalGridTaskOutcome =
  | { status: "pending" }
  | { status: "failed"; message: string }
  | { status: "completed"; result: CompletedLocalGridTask };

const TASK_IN_PROGRESS_STATUS_CODES = new Set([20100, 40601, 40602]);

export async function fetchLocalGridTaskResult(
  input: LocalGridTaskInput & {
    taskId: string;
    target: {
      placeId?: string | null;
      cid?: string | null;
      featureId?: string | null;
    };
  },
): Promise<LocalGridTaskOutcome> {
  const response = await serpApi().googleMapsTaskGetAdvanced(input.taskId);
  const task = response?.tasks?.[0];
  if (!response || response.status_code !== 20000 || !task) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message || "DataForSEO Maps task_get failed",
    );
  }
  if (
    task.status_code !== undefined &&
    TASK_IN_PROGRESS_STATUS_CODES.has(task.status_code)
  ) {
    return { status: "pending" };
  }
  if (task.status_code !== 20000) {
    if (!isNoResultsTask(task)) {
      return {
        status: "failed",
        message:
          task.status_message || `DataForSEO task failed (${task.status_code})`,
      };
    }
    return {
      status: "completed",
      result: buildLocalGridTaskResult(input, []),
    };
  }
  const items = parseTaskItems(
    "google-maps-task-get-advanced",
    task,
    localGridMapItemSchema,
  );
  return {
    status: "completed",
    result: buildLocalGridTaskResult(input, items),
  };
}
