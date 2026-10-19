import { AppError } from "@/server/lib/errors";
import { isErrorCode } from "@/shared/error-codes";

export class AiVisibilityError extends AppError {
  constructor(
    public readonly reason: string,
    message: string,
    public readonly runId?: string,
  ) {
    super("AI_VISIBILITY_ERROR", message);
  }
}

/**
 * Our copy for an answer that failed for a reason with no error code. A failed
 * answer stores this copy or an error code, never a provider's message.
 */
export const AI_ANSWER_FAILURES = {
  notArrived: "No answer arrived within the collection window.",
  runFailed: "The last check could not collect answers.",
  notStarted: "Collection could not start.",
  stoppedBeforeStart: "Collection stopped before it started.",
  stopped: "Collection stopped before it finished.",
} as const;

const FAILURE_COPY = new Set<string>(Object.values(AI_ANSWER_FAILURES));

/**
 * The error results show for an answer: an error code the client maps to its
 * own copy, or our failure copy. Older answers stored raw text. Our own
 * failures and the provider's rejections of a request we got wrong ("Invalid
 * 'location'.") read as internal errors. Any other text was a provider outage,
 * such as "Internal Server Error.".
 */
export function publicAiAnswerError(error: string | null): string | null {
  if (error === null || isErrorCode(error) || FAILURE_COPY.has(error))
    return error;
  if (error.startsWith("Collection stopped")) return AI_ANSWER_FAILURES.stopped;
  if (
    error === "DataForSEO did not accept this prompt." ||
    error === "DataForSEO returned an answer we could not read." ||
    error.startsWith("Invalid ")
  )
    return "INTERNAL_ERROR";
  return "UPSTREAM_UNAVAILABLE";
}
