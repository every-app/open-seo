import { queryOptions } from "@tanstack/react-query";
import { getOnboardingAnswers } from "@/serverFunctions/onboarding";

// Keep website and search_console first: Google's OAuth return lands on the
// Search Console step by its index in the URL. Agent setup is last so leaving
// to paste the prompt into an agent doesn't skip a step.
export const ONBOARDING_STEPS = [
  "website",
  "search_console",
  "analytics",
  "agent_setup",
] as const;
export const ONBOARDING_LAST_STEP = ONBOARDING_STEPS.length - 1;

export const onboardingAnswersQueryOptions = () =>
  queryOptions({
    queryKey: ["onboardingAnswers"],
    queryFn: () => getOnboardingAnswers(),
  });
