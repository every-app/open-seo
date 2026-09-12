import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import type { DataforseoErrorClassifier } from "@/server/lib/dataforseo/core";
import {
  attachDataforseoDiagnostics,
  extractSafeRequestMetadata,
  sanitizeDataforseoMessage,
  type DataforseoCallDiagnostics,
} from "@/server/lib/dataforseo/shared";

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
  ) {
    super("INTERNAL_ERROR", message);
    this.name = "DataforseoChargedTaskError";
  }
}

// The SDK types cost / path / result_count as optional with no runtime
// validation, so this is the one guard that guarantees we can bill a call.
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

interface DataforseoResponseLike<T extends DataforseoTaskLike> {
  status_code?: number;
  status_message?: string;
  tasks?: T[];
  [key: string]: unknown;
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

type AssertOkOptions = {
  /** Maps a recognised access / billing failure to a product error. */
  classify?: DataforseoErrorClassifier;
  /** Request path string handed to the classifier (e.g. "/v3/backlinks/summary/live"). */
  classifyPath?: string;
  /** Treat DataForSEO's "no search results" (40501) as an empty success. */
  treatNoResultsAsEmpty?: boolean;
};

/**
 * Build the sanitized diagnostics record for an application-level failure
 * (HTTP 200 + DataForSEO status_code != 20000, or a failed task inside an OK
 * response). Reads the endpoint/path, API family, and the task's echo of our
 * request params — never the full body.
 */
function appFailureDiagnostics(
  path: string | undefined,
  statusCode: number | undefined,
  statusMessage: string | undefined,
  task: DataforseoTaskLike | null,
): DataforseoCallDiagnostics {
  const endpoint =
    path !== undefined && path.startsWith("/")
      ? path.slice(1)
      : (path || undefined);
  const api = endpoint?.split("/");
  const diagnostics: DataforseoCallDiagnostics = {
    endpoint,
    api: api && api[0] === "v3" && api.length > 1 ? api[1] : undefined,
    httpStatus: 200,
    dataforseoStatus: statusCode ?? null,
    dataforseoMessage: sanitizeDataforseoMessage(statusMessage),
  };
  const requestMeta = extractSafeRequestMetadata(task?.data);
  if (requestMeta) diagnostics.request = requestMeta;
  return diagnostics;
}

function appFailurePath(
  responsePath: string | undefined,
  taskPath: string | undefined,
): string | undefined {
  if (responsePath && responsePath !== "") return responsePath;
  return taskPath;
}

/**
 * Validates that the top-level response and its first task both succeeded, and
 * returns that (SDK-typed) task. The single status / billing ladder shared by
 * every endpoint:
 *  - access / balance failure -> classified AppError
 *  - charged-but-failed task (cost present) -> DataforseoChargedTaskError
 *
 * Every application-level failure leaves here carrying a sanitized
 * `dataforseoDiagnostics` record (endpoint, HTTP 200, DataForSEO
 * status_code/status_message, safe request metadata) so the SAM Debug Trace
 * shows the exact application error instead of a collapsed label.
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
  const { classify, classifyPath, treatNoResultsAsEmpty } = options;

  if (response.status_code !== 20000) {
    const message = response.status_message || "DataForSEO request failed";
    const path = classifyPath ?? "";
    const error =
      classify?.(response.status_code, message, path) ??
      new AppError("INTERNAL_ERROR", message);
    attachDataforseoDiagnostics(
      error,
      appFailureDiagnostics(path, response.status_code, response.status_message, null),
    );
    throw error;
  }

  const task = response.tasks?.[0];
  if (!task) {
    throw new AppError("INTERNAL_ERROR", "DataForSEO response missing task");
  }

  if (task.status_code !== 20000) {
    if (treatNoResultsAsEmpty && isNoResultsTask(task)) return task;

    const message = task.status_message || "DataForSEO task failed";
    const path = appFailurePath(
      classifyPath,
      task.path ? `/${task.path.join("/")}` : undefined,
    );
    const error = classify?.(task.status_code, message, path ?? "");
    if (error) {
      attachDataforseoDiagnostics(
        error,
        appFailureDiagnostics(path, task.status_code, task.status_message, task),
      );
      throw error;
    }

    const detailedMessage = describeInvalidField(message, task);
    const billing = tryBuildTaskBilling(task);
    const diagnostics = appFailureDiagnostics(
      path,
      task.status_code,
      task.status_message,
      task,
    );
    if (billing) {
      const chargedError = new DataforseoChargedTaskError(
        detailedMessage,
        billing,
        INVALID_FIELD_MESSAGE_RE.test(message),
      );
      attachDataforseoDiagnostics(chargedError, diagnostics);
      throw chargedError;
    }

    const appError = new AppError("INTERNAL_ERROR", detailedMessage);
    attachDataforseoDiagnostics(appError, diagnostics);
    throw appError;
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
