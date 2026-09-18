import { z } from "zod";
import { dataforseoPost } from "@/server/lib/dataforseo/core";
import { invalidFieldName } from "@/server/lib/dataforseo/envelope";
import { AppError } from "@/server/lib/errors";

const DATAFORSEO_SANDBOX_URL = "https://sandbox.dataforseo.com";
const SANDBOX_TIMEOUT_MS = 10_000;

const sandboxTaskSchema = z.object({
  status_code: z.number(),
  status_message: z.string(),
});

/**
 * Ask the DataForSEO sandbox whether a SERP task with this location and
 * language would be accepted. The sandbox returns canned results but validates
 * request fields exactly like production and costs nothing, so a 20000 here
 * means the live endpoint will take the name too.
 */
export function probeSerpLocation(
  locationName: string,
  languageCode: string,
  options: { signal?: AbortSignal } = {},
) {
  return dataforseoPost(
    "/v3/serp/google/organic/live/advanced",
    [
      {
        keyword: "pizza",
        location_name: locationName,
        language_code: languageCode,
        depth: 10,
      },
    ],
    { baseUrl: DATAFORSEO_SANDBOX_URL, signal: options.signal },
  ).then((response) => sandboxTaskSchema.parse(response?.tasks?.[0]));
}

/**
 * Reject a non-canonical `location_name` at save time instead of at check
 * time. DataForSEO matches `location_name` verbatim, so "Catonsville, MD"
 * fails every run with task status 40501 and the tracker silently records no
 * snapshots.
 *
 * Fails open: a sandbox outage must not block saving a tracker, and the worst
 * case is the pre-existing behaviour for that one config.
 */
export async function assertSerpLocationNameAccepted(input: {
  locationName: string;
  languageCode: string;
  countryCode?: string;
}): Promise<void> {
  let task: z.infer<typeof sandboxTaskSchema>;
  try {
    task = await probeSerpLocation(input.locationName, input.languageCode, {
      signal: AbortSignal.timeout(SANDBOX_TIMEOUT_MS),
    });
  } catch (error) {
    console.warn("[serp-location-validate] sandbox unavailable, skipping", {
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  if (task.status_code === 20000) return;
  // Only 4xxxx is "your request is wrong"; anything else is the provider's
  // problem and must not block the save.
  if (task.status_code < 40000 || task.status_code >= 50000) {
    console.warn(
      "[serp-location-validate] sandbox unavailable, skipping",
      task,
    );
    return;
  }
  if (invalidFieldName(task.status_message) !== "location_name") {
    throw new AppError(
      "VALIDATION_ERROR",
      `DataForSEO rejected this tracker: ${task.status_message}`,
    );
  }
  throw new AppError(
    "VALIDATION_ERROR",
    `"${input.locationName}" is not a Google location name. Call search_serp_locations({ query: "${input.locationName.split(",")[0].trim()}"${input.countryCode ? `, countryCode: "${input.countryCode}"` : ""} }) and pass the returned locationName exactly.`,
  );
}
