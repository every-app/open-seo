import { queryOptions } from "@tanstack/react-query";
import { queryClient } from "@/client/tanstack-db";
import { getOnboardingStrategyState } from "@/serverFunctions/onboardingStrategy";

export const strategyStateQueryOptions = () =>
  queryOptions({
    queryKey: ["onboardingStrategyState"],
    queryFn: () => getOnboardingStrategyState(),
  });

export function invalidateStrategyState() {
  void queryClient.invalidateQueries({ queryKey: ["onboardingStrategyState"] });
}
