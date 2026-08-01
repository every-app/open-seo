import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { OnboardingAccountMenu } from "@/client/features/onboarding/OnboardingAccountMenu";
import { PostSignupOnboarding } from "@/client/features/onboarding/PostSignupOnboarding";
import {
  buildOnboardingPayload,
  ONBOARDING_LAST_STEP,
  type OnboardingAnswers,
  onboardingAnswersQueryOptions,
  restoreOnboardingAnswers,
} from "@/client/features/onboarding/onboardingModel";
import { captureClientEvent } from "@/client/lib/posthog";
import { queryClient } from "@/client/tanstack-db";
import { useSession } from "@/lib/auth-client";
import { saveOnboardingAnswers } from "@/serverFunctions/onboarding";

const ONBOARDING_EXISTING_USER_CUTOFF = "2026-05-27T00:00:00.000Z";

const clampStep = (step: number) =>
  Math.min(Math.max(0, Math.trunc(step)), ONBOARDING_LAST_STEP);

export const Route = createFileRoute("/_authenticated/onboarding/")({
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
  const onboardingQuery = useQuery(onboardingAnswersQueryOptions());

  if (!onboardingQuery.data) {
    return null;
  }

  const userCreatedAt = onboardingQuery.data.userCreatedAt
    ? Date.parse(onboardingQuery.data.userCreatedAt)
    : Date.now();
  const isExistingUser =
    userCreatedAt < Date.parse(ONBOARDING_EXISTING_USER_CUTOFF);
  const firstName = session?.user?.name?.split(" ")[0] || "";

  return (
    <OnboardingFlow
      firstName={firstName}
      isExistingUser={isExistingUser}
      initialAnswers={restoreOnboardingAnswers(onboardingQuery.data.answers)}
      email={session?.user?.email}
    />
  );
}

function OnboardingFlow({
  firstName,
  isExistingUser,
  initialAnswers,
  email,
}: {
  firstName: string;
  isExistingUser: boolean;
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
    onError: (error) => {
      console.error("Failed to save onboarding answers", error);
    },
  });

  const goToStep = (next: number) =>
    void navigate({ to: "/onboarding", search: { step: clampStep(next) } });

  const handleNext = () => {
    if (step === 0) {
      captureClientEvent("onboarding:interests_selected", {
        interests: answers.selectedInterests,
        interest_other: answers.interestOther.trim() || undefined,
      });
    }
    saveMutation.mutate({});
    goToStep(step + 1);
  };

  const handleSkip = () => {
    saveMutation.mutate({});
    captureClientEvent("onboarding:step_skipped", { step });
    goToStep(step + 1);
  };

  const handleFinish = async () => {
    try {
      await saveMutation.mutateAsync({ completed: true });
      // Refresh the shared cache so the destination's onboarding-redirect guard
      // sees the completed state and doesn't bounce the user back here.
      await queryClient.invalidateQueries({ queryKey: ["onboardingAnswers"] });
    } catch {
      // Already logged by the mutation's onError; still navigate the user on.
    }
    captureClientEvent("onboarding:completed", {
      interests: answers.selectedInterests,
      work_for: answers.workFor,
      source: answers.source,
    });
    // The dashboard's onboarding checklist owns MCP coaching now.
    void navigate({ to: "/", replace: true });
  };

  return (
    <PostSignupOnboarding
      firstName={firstName}
      title={isExistingUser ? "Tell us about your work" : undefined}
      helperText={
        isExistingUser
          ? "A little context helps us decide where to focus. You can also reach me anytime at ben@openseo.so."
          : undefined
      }
      step={step}
      answers={answers}
      onAnswersChange={setAnswers}
      onNext={handleNext}
      onBack={() => goToStep(step - 1)}
      onSkip={handleSkip}
      onFinish={handleFinish}
      isSaving={saveMutation.isPending}
      accountMenu={<OnboardingAccountMenu email={email} />}
    />
  );
}
