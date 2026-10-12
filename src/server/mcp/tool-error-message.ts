import { AppError } from "@/server/lib/errors";

/**
 * Error text for a tool call that took a `locationName`. An unknown area
 * also tells the agent how to find a valid one.
 */
export function toolErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return error instanceof AppError && error.code === "UNKNOWN_LOCATION"
    ? `${message} Call search_serp_locations and pass the returned locationName exactly.`
    : message;
}
