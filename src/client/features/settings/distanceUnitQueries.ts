import { queryOptions } from "@tanstack/react-query";
import { getDistanceUnit } from "@/serverFunctions/distance-unit";

export const distanceUnitQueryOptions = () =>
  queryOptions({
    queryKey: ["distanceUnit"],
    queryFn: () => getDistanceUnit(),
  });
