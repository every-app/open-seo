import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import type { DataforseoErrorClassifier } from "@/server/lib/dataforseo/core";
import type { ErrorCode } from "@/shared/error-codes";

// ---------------------------------------------------------------------------
// Billing envelope — the load-bearing seam that carries each call's USD cost
// out to the single metering point in client.ts. Every section fetcher returns
// DataforseoApiResponse<T>; nothing else constructs a billing object.
// ---------------------------------------------------------------------------

export type DataforseoApiCallCost = {
  path: string[];
  costUsd: number;
};

export type DataforseoApiResponse<T> = {
  data: T;
  billing: DataforseoApiCallCost;
};

/**
 * Thrown when a DataForSEO task fails *after* it was billed (cost + path are
 * present). meterDataforseoCall catches this to charge the customer for the
 * failed-but-charged call before rethrowing. Do not throw this for access /
 * balance failures; classify those first even when DataForSEO includes billing
 * metadata on the failed task.
 */
export class DataforseoChargedTaskError extends AppError {
  constructor(
    message: string,
    public readonly billing: DataforseoApiCallCost,
    /**
     * True when the task failed because OUR request was malformed (DataForSEO
     * "Invalid Field: ..."). The customer got no value, so — when the task
     * wasn't billed — meterDataforseoCall skips the charge and rethrows this as
     * a non-reportable VALIDATION_ERROR.
     */
    public readonly isInvalidField = false,
    /**
     * Classification for the failure. Defaults to INTERNAL_ERROR (our bug);
     * DataForSEO's own backend failures pass UPSTREAM_UNAVAILABLE so the user
     * sees "provider temporarily unavailable" and the flake isn't captured as
     * an app exception.
     */
    code: ErrorCode = "INTERNAL_ERROR",
  ) {
    super(code, message);
    this.name = "DataforseoChargedTaskError";
  }
}

// cost / path / result_count arrive from the wire untyped and optional, so
// this is the one guard that guarantees we can bill a call.
const billingMetadataSchema = z.object({
  path: z.array(z.string()),
  cost: z.number(),
  result_count: z.number().nullable().optional(),
});

export interface DataforseoTaskLike {
  status_code?: number;
  status_message?: string;
  path?: string[];
  cost?: number;
  result_count?: number;
  result?: unknown[];
  [key: string]: unknown;
}

export interface DataforseoResponseLike<T extends DataforseoTaskLike> {
  status_code?: number;
  status_message?: string;
  tasks?: T[];
  [key: string]: unknown;
}

/** `task.result[0]` entry carrying an `items` list — the common live-endpoint
 *  shape. The index signature covers per-endpoint extras (`check_url`, …). */
export interface DataforseoItemsResult<TItem> {
  items?: TItem[] | null;
  total_count?: number | null;
  [key: string]: unknown;
}

/** Task whose `result` entries follow the `items` shape. Item types are the
 *  caller's claim about the payload (as the SDK's were); fields we act on are
 *  Zod-validated by the section fetchers. */
export interface DataforseoItemsTask<TItem> extends DataforseoTaskLike {
  result?: DataforseoItemsResult<TItem>[];
}

function tryBuildTaskBilling(task: unknown): DataforseoApiCallCost | null {
  const parsed = billingMetadataSchema.safeParse(task);
  if (!parsed.success) return null;
  return {
    path: parsed.data.path,
    costUsd: parsed.data.cost,
  };
}

export function buildTaskBilling(
  task: DataforseoTaskLike,
): DataforseoApiCallCost {
  const billing = tryBuildTaskBilling(task);
  if (!billing) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO task is missing billing metadata (path/cost)",
    );
  }
  return billing;
}

const INVALID_FIELD_MESSAGE_RE = /Invalid Field:\s*'([^']+)'/i;

/**
 * DataForSEO echoes the posted request params back on `task.data`. Its
 * validation rejections are opaque ("Invalid Field: 'target'.") and name the
 * field but not the value we sent — and these tasks are charged, so we want to
 * know exactly what tripped them. Append the offending value so the charged
 * failure is diagnosable from the captured message alone.
 */
function describeInvalidField(
  message: string,
  task: DataforseoTaskLike,
): string {
  const match = message.match(INVALID_FIELD_MESSAGE_RE);
  if (!match) return message;
  const field = match[1];
  if (!isRecord(task.data)) return message;
  const value = task.data[field];
  if (value === undefined) return message;
  return `${message} (sent ${field}=${JSON.stringify(value)})`;
}

/**
 * DataForSEO's "No Search Results" (40501) — a successful empty result, not a
 * failure. Match on the status message, not the code alone: 40501 also covers
 * validation rejections like "Invalid Field: 'target'.", which are real charged
 * failures we must surface rather than mask as empty results.
 */
export function isNoResultsTask(task: DataforseoTaskLike): boolean {
  return (
    task.status_message?.toLowerCase().includes("no search results") ?? false
  );
}

/**
 * Status codes where DataForSEO's own backend failed, returned on an HTTP 200
 * with a failed task. These are provider flakes, not our bug, so they classify
 * as UPSTREAM_UNAVAILABLE: the customer gets the retry-in-a-moment message
 * instead of a generic "unexpected error", and the flake isn't captured.
 *
 * An explicit list, not a `>= 50000` range: 40101 "Internal SE Server Error."
 * is the one that actually fires (by far our loudest captured exception) and it
 * sits in the 40000 family, while 50100 "Not Implemented." means we posted a
 * non-existing task or parameter — our bug, and it must stay reportable.
 * Likewise 50001 "Error While Checking the Balance." stays visible.
 * @see https://docs.dataforseo.com/v3/appendix/errors/
 */
const UPSTREAM_FAILURE_STATUS_CODES = new Set([
  40101, // Internal SE Server Error.
  40103, // Task execution failed, please try to resubmit.
  50000, // Internal Error.
  50301, // 3rd Party API Service Unavailable.
  50302, // Internal 3rd Party API Service Unavailable.
  50303, // Update in progress. Please try after a few minutes.
  50304, // This function temporarily unavailable.
  50401, // Internal Error - Timeout.
  50402, // Target page took too long to respond.
]);

function isUpstreamServerErrorTask(task: DataforseoTaskLike): boolean {
  return (
    task.status_code !== undefined &&
    UPSTREAM_FAILURE_STATUS_CODES.has(task.status_code)
  );
}

/** Task lifecycle codes meaning "not done yet": Task Created / Task Handed /
 *  Task In Queue. A task_get returning one of these is pending, not failed. */
const TASK_IN_PROGRESS_STATUS_CODES = new Set([20100, 40601, 40602]);

export function isTaskInProgress(task: DataforseoTaskLike): boolean {
  return (
    task.status_code !== undefined &&
    TASK_IN_PROGRESS_STATUS_CODES.has(task.status_code)
  );
}

type AssertOkOptions = {
  /** Maps a recognised access / billing failure to a product error. */
  classify?: DataforseoErrorClassifier;
  /** Request path string handed to the classifier (e.g. "/v3/backlinks/summary/live"). */
  classifyPath?: string;
  /** Treat DataForSEO's "no search results" (40501) as an empty success. */
  treatNoResultsAsEmpty?: boolean;
  /** Task status that counts as success. Live endpoints return 20000; task_post
   *  entries return 20100 "Task Created". */
  okTaskStatusCode?: number;
};

/**
 * Validates that the top-level response and its first task both succeeded, and
 * returns that (SDK-typed) task. The single status / billing ladder shared by
 * every endpoint:
 *  - access / balance failure -> classified AppError
 *  - DataForSEO's own backend erring (5xxxx) -> UPSTREAM_UNAVAILABLE
 *  - charged-but-failed task (cost present) -> DataforseoChargedTaskError
 */
export function assertOk<T extends DataforseoTaskLike>(
  response: DataforseoResponseLike<T> | null,
  options: AssertOkOptions = {},
): T {
  if (!response) {
    throw new AppError(
      "INTERNAL_ERROR",
      "DataForSEO returned an empty response",
    );
  }
  const { classify, classifyPath, treatNoResultsAsEmpty, okTaskStatusCode } =
    options;

  if (response.status_code !== 20000) {
    const message = response.status_message || "DataForSEO request failed";
    throw (
      classify?.(response.status_code, message, classifyPath ?? "") ??
      new AppError("INTERNAL_ERROR", message)
    );
  }

  const task = response.tasks?.[0];
  if (!task) {
    throw new AppError("INTERNAL_ERROR", "DataForSEO response missing task");
  }

  if (task.status_code !== (okTaskStatusCode ?? 20000)) {
    if (treatNoResultsAsEmpty && isNoResultsTask(task)) return task;

    const message = task.status_message || "DataForSEO task failed";
    const path = classifyPath ?? (task.path ? `/${task.path.join("/")}` : "");
    const classified = classify?.(task.status_code, message, path);
    if (classified) throw classified;

    const detailedMessage = describeInvalidField(message, task);
    const isUpstreamFailure = isUpstreamServerErrorTask(task);
    // UPSTREAM_UNAVAILABLE is non-reportable, and the error handlers only log
    // what they capture, so warn here to keep the provider's failure rate — and
    // the only remaining record of the message — visible in Workers
    // Observability. Warn, not error: there is nothing in the app to fix.
    if (isUpstreamFailure)
      console.warn("dataforseo.upstream-task-failed", {
        path,
        status: task.status_code,
        message: task.status_message,
      });
    const code: ErrorCode = isUpstreamFailure
      ? "UPSTREAM_UNAVAILABLE"
      : "INTERNAL_ERROR";

    const billing = tryBuildTaskBilling(task);
    if (billing)
      throw new DataforseoChargedTaskError(
        detailedMessage,
        billing,
        INVALID_FIELD_MESSAGE_RE.test(message),
        code,
      );

    throw new AppError(code, detailedMessage);
  }

  return task;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads `task.result[0].total_count` for paginated list endpoints. */
export function parseTaskTotalCount(task: DataforseoTaskLike): number | null {
  const first = task.result?.[0];
  if (!isRecord(first)) return null;
  return typeof first.total_count === "number" ? first.total_count : null;
}

/** Reads `task.result[0].items`, validating against a Zod schema for loosely-typed endpoints. */
export function parseTaskItems<T extends z.ZodTypeAny>(
  endpoint: string,
  task: DataforseoTaskLike,
  itemSchema: T,
): Array<z.infer<T>> {
  const first = task.result?.[0];
  const items = isRecord(first) ? first.items : [];
  const parsed = z.array(itemSchema).safeParse(items ?? []);
  if (!parsed.success) {
    console.error(
      `dataforseo.${endpoint}.invalid-payload`,
      parsed.error.issues.slice(0, 5),
    );
    throw new AppError(
      "INTERNAL_ERROR",
      `DataForSEO ${endpoint} returned an invalid response shape`,
    );
  }
  return parsed.data;
}
