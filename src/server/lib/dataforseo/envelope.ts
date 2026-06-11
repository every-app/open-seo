import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import type { DataforseoErrorClassifier } from "@/server/lib/dataforseo/core";

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

type AssertOkOptions = {
  /** Maps a recognised access / billing failure to a product error. */
  classify?: DataforseoErrorClassifier;
  /** Request path string handed to the classifier (e.g. "/v3/backlinks/summary/live"). */
  classifyPath?: string;
  /** Treat DataForSEO's "no search results" (40501) as an empty success. */
  treatNoResultsAsEmpty?: boolean;
};

/**
 * Validates that the top-level response and its first task both succeeded, and
 * returns that (SDK-typed) task. The single status / billing ladder shared by
 * every endpoint:
 *  - access / balance failure -> classified AppError
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
  const { classify, classifyPath, treatNoResultsAsEmpty } = options;

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

  if (task.status_code !== 20000) {
    const isNoResults =
      task.status_code === 40501 ||
      (task.status_message?.toLowerCase().includes("no search results") ??
        false);
    if (treatNoResultsAsEmpty && isNoResults) return task;

    const message = task.status_message || "DataForSEO task failed";
    const path = classifyPath ?? (task.path ? `/${task.path.join("/")}` : "");
    const classified = classify?.(task.status_code, message, path);
    if (classified) throw classified;

    const billing = tryBuildTaskBilling(task);
    if (billing) throw new DataforseoChargedTaskError(message, billing);

    throw new AppError("INTERNAL_ERROR", message);
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
