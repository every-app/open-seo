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
import { managedAccessQueryOptions } from "@/client/features/billing/managed-access";
import { captureClientEvent } from "@/client/lib/posthog";
import { queryClient } from "@/client/tanstack-db";
import { useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { SUBSCRIBE_ROUTE } from "@/shared/billing";
import { saveOnboardingAnswers } from "@/serverFunctions/onboarding";

const ONBOARDING_EXISTING_USER_CUTOFF = "2026-05-27T00:00:00.000Z";

const clampStep = (step: number) =>
  Math.min(Math.max(0, Math.trunc(step)), ONBOARDING_LAST_STEP);

export const Route = createFileRoute("/_authenticated/onboarding/")({
  // Step lives in the URL so it survives refresh and works with back/forward.
  // The subscribe route appends `checkout=success` when it sends a just-paid
  // user back here; it triggers the one-time "You're in!" screen on the GSC
  // step. Preserve it through validation so the router doesn't strip it.
  validateSearch: (
    search: Record<string, unknown>,
  ): { step: number; checkout?: string } => {
    const raw = Number(search.step);
    return {
      step: Number.isFinite(raw) ? clampStep(raw) : 0,
      ...(search.checkout === "success" ? { checkout: "success" } : {}),
    };
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

  // Self-hosted has no paywall. Hosted users hit the subscribe gate after the
  // three intro questions, before the paid GSC/MCP connect steps.
  const isHostedMode = isHostedClientAuthMode();
  const accessQuery = useQuery({
    ...managedAccessQueryOptions(),
    enabled: isHostedMode,
  });
  const needsSubscription =
    isHostedMode && accessQuery.data?.hasManagedAccess === false;

  const saveMutation = useMutation({
    mutationFn: (extra: {
      mcpSetupIntent?: "yes" | "no";
      completed?: boolean;
    }) =>
      saveOnboardingAnswers({
        data: buildOnboardingPayload(answers, step, extra),
      }),
    onError: (error) => {
      console.error("Failed to save onboarding answers", error);
    },
  });

  const goToStep = (next: number) =>
    void navigate({ to: "/onboarding", search: { step: clampStep(next) } });

  const advanceFromCurrentStep = () => {
    const next = clampStep(step + 1);
    // After the three intro questions, hosted users hit the subscribe paywall
    // before the GSC/MCP connect steps. We return to step 3 (GSC) afterward;
    // the subscribe route appends `checkout=success` once payment lands, which
    // drives the one-time "You're in!" screen there.
    // The strategy chat that used to sit here is parked for now; see
    // /onboarding/chat (still routed) — we'll revisit it later.
    if (step === 2 && needsSubscription) {
      void navigate({
        to: SUBSCRIBE_ROUTE,
        search: { redirect: `/onboarding?step=${next}` },
        replace: true,
      });
      return;
    }
    goToStep(next);
  };

  const handleNext = () => {
    if (step === 0) {
      captureClientEvent("onboarding:interests_selected", {
        interests: answers.selectedInterests,
        interest_other: answers.interestOther.trim() || undefined,
      });
    }
    saveMutation.mutate({});
    advanceFromCurrentStep();
  };

  const handleSkip = () => {
    saveMutation.mutate({});
    captureClientEvent("onboarding:step_skipped", { step });
    advanceFromCurrentStep();
  };

  const handleFinish = async (mcpSetupIntent: "yes" | "no") => {
    try {
      await saveMutation.mutateAsync({ mcpSetupIntent, completed: true });
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
      wants_mcp_setup: mcpSetupIntent === "yes",
    });
    if (mcpSetupIntent === "yes") {
      void navigate({ to: "/ai", replace: true });
    } else {
      void navigate({ to: "/", replace: true });
    }
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
      onUpgradeAcknowledged={() =>
        void navigate({ to: "/onboarding", search: { step }, replace: true })
      }
      isSaving={saveMutation.isPending}
      accountMenu={<OnboardingAccountMenu email={email} />}
    />
  );
}
