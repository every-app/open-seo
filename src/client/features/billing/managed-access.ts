import { queryOptions } from "@tanstack/react-query";
import { getManagedAccessStatus } from "@/serverFunctions/billing";

export const MANAGED_ACCESS_QUERY_KEY = ["managedAccessStatus"];

export const managedAccessQueryOptions = () =>
  queryOptions({
    queryKey: MANAGED_ACCESS_QUERY_KEY,
    queryFn: () => getManagedAccessStatus(),
    staleTime: 30_000,
  });
