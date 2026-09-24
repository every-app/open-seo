import { useMutation, useQuery } from "@tanstack/react-query";
import { clamp } from "remeda";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
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

const clampStep = (step: number) =>
  clamp(Math.trunc(step), { min: 0, max: ONBOARDING_LAST_STEP });

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
  const onboardingQuery = useQuery(onboardingAnswersQueryOptions());

  if (!onboardingQuery.data) {
    return null;
  }

  return (
    <OnboardingFlow
      initialAnswers={restoreOnboardingAnswers(onboardingQuery.data.answers)}
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
    mutationFn: (extra: {
      completed?: boolean;
      mcpSetupIntent?: "yes" | "no";
    }) =>
      saveOnboardingAnswers({
        data: buildOnboardingPayload(answers, step, extra),
      }),
    onError: (error) => {
      toast.error(
        getStandardErrorMessage(
          error,
          "Couldn’t save your answers. Please try again.",
        ),
      );
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

  const handleFinish = async (mcpSetupIntent?: "yes" | "no") => {
    try {
      await saveMutation.mutateAsync({
        completed: true,
        ...(mcpSetupIntent ? { mcpSetupIntent } : {}),
      });
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
    // The dashboard's onboarding checklist owns MCP coaching now.
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
      accountMenu={<OnboardingAccountMenu email={email} />}
    />
  );
}
