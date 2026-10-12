import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PlanPageAccountMenu } from "@/client/features/billing/PlanPageAccountMenu";
import { PostSignupOnboarding } from "@/client/features/onboarding/PostSignupOnboarding";
import {
  buildOnboardingPayload,
  ONBOARDING_LAST_STEP,
  ONBOARDING_STEPS,
  type OnboardingAnswers,
  onboardingAnswersQueryOptions,
  restoreOnboardingAnswers,
} from "@/client/features/onboarding/onboardingModel";
import { captureClientEvent } from "@/client/lib/posthog";
import { queryClient } from "@/client/tanstack-db";
import { useSession } from "@/lib/auth-client";
import { saveOnboardingAnswers } from "@/serverFunctions/onboarding";

const clampStep = (step: number) =>
  Math.min(Math.max(0, Math.trunc(step)), ONBOARDING_LAST_STEP);

export const Route = createFileRoute("/_authenticated/onboarding/")({
  // The app renders inside ClientOnly, and this guard reads account-scoped data
  // through a module-scoped query client. Keep it out of server requests so one
  // worker isolate cannot reuse another account's cached onboarding state.
  ssr: false,
  // Step lives in the URL so it survives refresh and works with back/forward.
  validateSearch: (search: Record<string, unknown>): { step: number } => {
    const raw = Number(search.step);
    return { step: Number.isFinite(raw) ? clampStep(raw) : 0 };
  },
  // Send users who already finished onboarding home before rendering. Running
  // this in beforeLoad (not a component effect) means it can't race with the
  // navigation we trigger after the final step.
  beforeLoad: async () => {
    const data = await queryClient.ensureQueryData(
      onboardingAnswersQueryOptions(),
    );
    if (data.completedAt) {
      throw redirect({ to: "/", replace: true });
    }
  },
  component: OnboardingPage,
});

function OnboardingPage() {
  const { data: session } = useSession();
  // beforeLoad seeded this query with ensureQueryData, so data is ready.
  const { data } = useSuspenseQuery(onboardingAnswersQueryOptions());

  return (
    <OnboardingFlow
      initialAnswers={restoreOnboardingAnswers(data.answers)}
      email={session?.user?.email}
    />
  );
}

function OnboardingFlow({
  initialAnswers,
  email,
}: {
  initialAnswers: OnboardingAnswers;
  email: string | undefined;
}) {
  const navigate = useNavigate();
  const { step } = Route.useSearch();
  const [answers, setAnswers] = useState<OnboardingAnswers>(initialAnswers);

  const saveMutation = useMutation({
    mutationFn: (extra: { completed?: boolean }) =>
      saveOnboardingAnswers({
        data: buildOnboardingPayload(answers, step, extra),
      }),
  });

  const goToStep = (next: number) =>
    void navigate({ to: "/onboarding", search: { step: clampStep(next) } });

  // Wait for the save before moving on, so a failure toast shows on the step
  // the user can retry instead of on the next one.
  const handleNext = async () => {
    try {
      await saveMutation.mutateAsync({});
    } catch {
      return;
    }
    if (ONBOARDING_STEPS[step] === "interests") {
      captureClientEvent("onboarding:interests_selected", {
        interests: answers.selectedInterests,
        interest_other: answers.interestOther.trim() || undefined,
      });
    }
    goToStep(step + 1);
  };

  const handleSkip = async () => {
    try {
      await saveMutation.mutateAsync({});
    } catch {
      return;
    }
    captureClientEvent("onboarding:step_skipped", {
      step,
      step_name: ONBOARDING_STEPS[step],
    });
    goToStep(step + 1);
  };

  const handleFinish = async () => {
    try {
      await saveMutation.mutateAsync({ completed: true });
      // Refresh the shared cache so the destination's onboarding-redirect guard
      // sees the completed state and doesn't bounce the user back here.
      await queryClient.invalidateQueries({ queryKey: ["onboardingAnswers"] });
    } catch {
      // Keep the user here to retry; an unsaved completion would redirect back.
      return;
    }
    captureClientEvent("onboarding:completed", {
      interests: answers.selectedInterests,
      work_for: answers.workFor,
      source: answers.source,
    });
    void navigate({ to: "/", replace: true });
  };

  return (
    <PostSignupOnboarding
      step={step}
      answers={answers}
      onAnswersChange={setAnswers}
      onNext={handleNext}
      onBack={() => goToStep(step - 1)}
      onSkip={handleSkip}
      onFinish={handleFinish}
      isSaving={saveMutation.isPending}
      accountMenu={<PlanPageAccountMenu email={email} />}
    />
  );
}
