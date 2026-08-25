import { z } from "zod";
import {
  BusinessDataBusinessListingsSearchLiveRequestInfo,
  BusinessDataGoogleExtendedReviewsTaskPostRequestInfo,
  BusinessDataGoogleMyBusinessInfoLiveRequestInfo,
  BusinessDataGoogleMyBusinessUpdatesTaskPostRequestInfo,
  BusinessDataGoogleQuestionsAndAnswersLiveRequestInfo,
  BusinessDataGoogleReviewsTaskPostRequestInfo,
  type BusinessDataBusinessListingsSearchLiveItem,
} from "dataforseo-client";
import {
  businessDataApi,
  businessDataTaskApi,
} from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  isNoResultsTask,
  isRecord,
  isTaskInProgress,
  type DataforseoApiResponse,
  type DataforseoResponseLike,
  type DataforseoTaskLike,
} from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";

type BusinessListingItem = BusinessDataBusinessListingsSearchLiveItem;

/**
 * Location + language for the Google business_data endpoints. They accept
 * either a coordinate ("lat,lng,radius" in meters) or a location code, never
 * both, so the coordinate wins when present.
 */
type BusinessLocationInput = {
  locationCoordinate?: string;
  locationCode?: number;
  languageCode: string;
};

function locationParams(input: BusinessLocationInput) {
  return input.locationCoordinate
    ? { location_coordinate: input.locationCoordinate }
    : { location_code: input.locationCode };
}

export async function fetchBusinessListingsSearch(input: {
  categories?: string[];
  title?: string;
  locationCoordinate: string;
  isClaimed?: boolean;
  filters?: unknown[];
  orderBy?: string[];
  limit: number;
  offset?: number;
}): Promise<DataforseoApiResponse<BusinessListingItem[]>> {
  const response = await businessDataApi().businessListingsSearchLive([
    new BusinessDataBusinessListingsSearchLiveRequestInfo({
      categories: input.categories,
      title: input.title,
      location_coordinate: input.locationCoordinate,
      is_claimed: input.isClaimed,
      filters: input.filters,
      order_by: input.orderBy,
      limit: input.limit,
      offset: input.offset,
    }),
  ]);
  // "No Search Results" (40501) is a valid empty result for obscure
  // businesses/keywords — DataForSEO still charges for it, so treat it as an
  // empty success instead of surfacing a charged-task error to the user.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: task.result?.[0]?.items ?? [],
    billing: buildTaskBilling(task),
  };
}

// Q&A results carry both answered (`items`) and unanswered
// (`items_without_answers`) rows; the SDK types this result as `any`, so we
// validate a generic record shape and flatten both.
const questionsResultSchema = z
  .object({
    items: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
    items_without_answers: z
      .array(z.record(z.string(), z.unknown()))
      .nullable()
      .optional(),
  })
  .passthrough();

function combinedQuestionItems(results: unknown): Record<string, unknown>[] {
  const list = Array.isArray(results) ? results : [];
  return list.flatMap((result) => {
    const parsed = questionsResultSchema.safeParse(result ?? {});
    if (!parsed.success) return [];
    return [
      ...(parsed.data.items ?? []),
      ...(parsed.data.items_without_answers ?? []),
    ];
  });
}

export async function fetchQuestionsAnswers(input: {
  keyword: string;
  locationCoordinate: string;
  languageCode: string;
  depth: number;
}): Promise<DataforseoApiResponse<Record<string, unknown>[]>> {
  const response = await businessDataApi().googleQuestionsAndAnswersLive([
    new BusinessDataGoogleQuestionsAndAnswersLiveRequestInfo({
      keyword: input.keyword,
      location_coordinate: input.locationCoordinate,
      language_code: input.languageCode,
      depth: input.depth,
    }),
  ]);
  // "No Search Results" (40501) is a valid empty result for obscure
  // businesses/keywords — DataForSEO still charges for it, so treat it as an
  // empty success instead of surfacing a charged-task error to the user.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  return {
    data: combinedQuestionItems(task.result),
    billing: buildTaskBilling(task),
  };
}

export async function fetchMyBusinessInfo(
  input: { keyword: string } & BusinessLocationInput,
): Promise<DataforseoApiResponse<Record<string, unknown> | null>> {
  const response = await businessDataApi().googleMyBusinessInfoLive([
    new BusinessDataGoogleMyBusinessInfoLiveRequestInfo({
      keyword: input.keyword,
      ...locationParams(input),
      language_code: input.languageCode,
    }),
  ]);
  // 40501 = billed empty result: a business Google has no profile for.
  const task = assertOk(response, { treatNoResultsAsEmpty: true });
  const entry = task.result?.[0];
  const item = entry?.items?.[0];
  if (!isRecord(item)) {
    return { data: null, billing: buildTaskBilling(task) };
  }
  // check_url (the Google Maps link DataForSEO verified against) lives on the
  // result entry, not the item — merge it so callers get one complete record.
  if (item.check_url == null) item.check_url = entry?.check_url;
  return { data: item, billing: buildTaskBilling(task) };
}

// ---------------------------------------------------------------------------
// Task-queue business data (reviews, extended reviews, profile updates).
// DataForSEO bills these at task_post; task_get collection is free. The post
// fetchers therefore run through the metered client while
// fetchBusinessDataTaskResult deliberately does not — see index.ts.
// ---------------------------------------------------------------------------

/** High execution priority: reviews normally settle within ~20s instead of
 *  minutes, which is what makes a single MCP call able to return them. */
const TASK_PRIORITY_HIGH = 2;

/**
 * Validates a task_post response and returns the created task's id. `assertOk`
 * applies the standard charged-failure ladder (a rejected post entry still
 * carries the cost DataForSEO charged, and "Invalid Field" rejections stay
 * non-reportable); 20100 "Task Created" is the success status for posts.
 */
function postedTaskId<T extends DataforseoTaskLike & { id?: string }>(
  response: DataforseoResponseLike<T> | null,
): DataforseoApiResponse<string> {
  const task = assertOk(response, { okTaskStatusCode: 20100 });
  if (!task.id) {
    throw new AppError("INTERNAL_ERROR", "DataForSEO did not return a task id");
  }
  return { data: task.id, billing: buildTaskBilling(task) };
}

export type BusinessTaskEndpoint =
  | "reviews"
  | "extended_reviews"
  | "my_business_updates";

type BusinessIdentifierInput = {
  keyword?: string;
  cid?: string;
  placeId?: string;
};

export async function postGoogleReviewsTask(
  input: BusinessIdentifierInput &
    BusinessLocationInput & {
      depth: number;
      /** Only the regular reviews endpoint supports sorting. */
      sortBy?: string;
      /** Collect reviews Google surfaces from other sites (Yelp, Tripadvisor). */
      includeOtherSources: boolean;
    },
): Promise<DataforseoApiResponse<string>> {
  if (input.includeOtherSources) {
    return postedTaskId(
      await businessDataTaskApi().googleExtendedReviewsTaskPost([
        new BusinessDataGoogleExtendedReviewsTaskPostRequestInfo({
          keyword: input.keyword,
          cid: input.cid,
          place_id: input.placeId,
          ...locationParams(input),
          language_code: input.languageCode,
          depth: input.depth,
          priority: TASK_PRIORITY_HIGH,
        }),
      ]),
    );
  }
  return postedTaskId(
    await businessDataTaskApi().googleReviewsTaskPost([
      new BusinessDataGoogleReviewsTaskPostRequestInfo({
        keyword: input.keyword,
        cid: input.cid,
        place_id: input.placeId,
        ...locationParams(input),
        language_code: input.languageCode,
        depth: input.depth,
        sort_by: input.sortBy,
        priority: TASK_PRIORITY_HIGH,
      }),
    ]),
  );
}

export async function postMyBusinessUpdatesTask(
  input: { keyword: string; depth: number } & BusinessLocationInput,
): Promise<DataforseoApiResponse<string>> {
  return postedTaskId(
    await businessDataTaskApi().googleMyBusinessUpdatesTaskPost([
      new BusinessDataGoogleMyBusinessUpdatesTaskPostRequestInfo({
        keyword: input.keyword,
        ...locationParams(input),
        language_code: input.languageCode,
        depth: input.depth,
        priority: TASK_PRIORITY_HIGH,
      }),
    ]),
  );
}

export type BusinessTaskOutcome = {
  status: "pending" | "completed";
  /** The first `result` entry once the task completed; null when empty. */
  result: Record<string, unknown> | null;
};

/**
 * Collects one queued business_data task. Deliberately not metered and not
 * wrapped in the billing envelope: collection is free (the task was charged at
 * task_post), so routing it through the metering seam would charge twice.
 */
export async function fetchBusinessDataTaskResult(input: {
  endpoint: BusinessTaskEndpoint;
  taskId: string;
}): Promise<BusinessTaskOutcome> {
  const api = businessDataApi();
  const response =
    input.endpoint === "reviews"
      ? await api.googleReviewsTaskGet(input.taskId)
      : input.endpoint === "extended_reviews"
        ? await api.googleExtendedReviewsTaskGet(input.taskId)
        : await api.googleMyBusinessUpdatesTaskGet(input.taskId);

  const task = response?.tasks?.[0];
  if (!response || response.status_code !== 20000 || !task) {
    throw new AppError(
      "INTERNAL_ERROR",
      response?.status_message || "DataForSEO task_get failed",
    );
  }

  if (isTaskInProgress(task)) return { status: "pending", result: null };

  if (task.status_code !== 20000) {
    // "No Search Results" is a valid empty outcome (no reviews/updates yet).
    if (!isNoResultsTask(task)) {
      throw new AppError(
        "INTERNAL_ERROR",
        task.status_message || `DataForSEO task failed (${task.status_code})`,
      );
    }
    return { status: "completed", result: null };
  }

  const first = task.result?.[0];
  return { status: "completed", result: isRecord(first) ? first : null };
}

const businessCategorySchema = z
  .object({
    category_name: z.string(),
    business_count: z.number().nullable().optional(),
  })
  .passthrough();

type BusinessCategoryRow = {
  category: string;
  businessCount: number | null;
};

/** Top Business Listings categories by business count. Free at DataForSEO. */
export async function fetchBusinessListingsCategories(): Promise<
  DataforseoApiResponse<BusinessCategoryRow[]>
> {
  const response = await businessDataApi().businessListingsCategories();
  const task = assertOk(response);
  // This endpoint puts rows directly on `result` rather than `result[0].items`.
  const rows = (task.result ?? []).flatMap((entry) => {
    const parsed = businessCategorySchema.safeParse(entry);
    if (!parsed.success) return [];
    return [
      {
        category: parsed.data.category_name,
        businessCount: parsed.data.business_count ?? null,
      },
    ];
  });
  return { data: rows, billing: buildTaskBilling(task) };
}
