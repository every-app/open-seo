import { queryOptions } from "@tanstack/react-query";
import { getEveryAppAccount } from "@/serverFunctions/everyApp";

/**
 * The member's Every App account and the gateway to link back to; null off
 * Every App. Read by the sidebar footer and the settings page.
 */
export const everyAppAccountQueryOptions = () =>
  queryOptions({
    queryKey: ["every-app-account"],
    queryFn: () => getEveryAppAccount(),
    staleTime: 5 * 60 * 1000,
  });
