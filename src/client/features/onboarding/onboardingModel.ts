import { queryOptions } from "@tanstack/react-query";
import { getOnboardingAnswers } from "@/serverFunctions/onboarding";

// Preserve main's setup step indices for existing links and OAuth returns.
export const ONBOARDING_STEPS = [
  "website",
  "search_console",
  "agent_setup",
] as const;
export const ONBOARDING_LAST_STEP = ONBOARDING_STEPS.length - 1;

export const onboardingAnswersQueryOptions = () =>
  queryOptions({
    queryKey: ["onboardingAnswers"],
    queryFn: () => getOnboardingAnswers(),
  });
