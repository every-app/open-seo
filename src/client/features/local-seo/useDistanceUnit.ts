import { useSuspenseQuery } from "@tanstack/react-query";
import { distanceUnitQueryOptions } from "@/client/features/settings/distanceUnitQueries";

/** The unit Local SEO shows distances in, from the user's settings. The Local
 *  SEO route loads it first, so this never suspends. */
export function useDistanceUnit() {
  return useSuspenseQuery(distanceUnitQueryOptions()).data;
}
