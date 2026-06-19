import { createFileRoute } from "@tanstack/react-router";
import { OnboardingStrategy } from "@/client/features/onboarding/OnboardingStrategy";

export const Route = createFileRoute("/_authenticated/onboarding/chat")({
  component: OnboardingStrategy,
});
