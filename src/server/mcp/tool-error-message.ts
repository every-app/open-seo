import { AppError } from "@/server/lib/errors";

/**
 * Error text an agent sees for a failed tool call. An unknown area also tells
 * the agent how to find a valid one, and a provider outage gets the same
 * note that it is the provider's problem, not the request's.
 */
export function toolErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (!(error instanceof AppError)) return message;
  if (error.code === "UNKNOWN_LOCATION")
    return `${message} Call search_serp_locations and pass the returned locationName exactly.`;
  if (error.code === "UPSTREAM_UNAVAILABLE")
    return `${message} The data provider is temporarily unavailable; this is not a problem with the request.`;
  return message;
}
