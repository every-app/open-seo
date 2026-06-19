import { queryOptions } from "@tanstack/react-query";
import { queryClient } from "@/client/tanstack-db";
import { getOnboardingChatState } from "@/serverFunctions/onboardingChat";

export const onboardingChatStateQueryOptions = () =>
  queryOptions({
    queryKey: ["onboardingChatState"],
    queryFn: () => getOnboardingChatState(),
  });

export function invalidateOnboardingChatState() {
  void queryClient.invalidateQueries({ queryKey: ["onboardingChatState"] });
}
