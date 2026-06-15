import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Settings, User } from "lucide-react";
import { useState } from "react";
import { ThemePreferenceMenuItems } from "@/client/components/ThemePreferenceMenuItems";
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
import { signOutAndRedirect, useSession } from "@/lib/auth-client";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { SUBSCRIBE_ROUTE } from "@/shared/billing";
import { saveOnboardingAnswers } from "@/serverFunctions/onboarding";

const ONBOARDING_EXISTING_USER_CUTOFF = "2026-05-27T00:00:00.000Z";

// First step that requires a subscription. The earlier steps (interests, who
// you work for, how you found us) collect profiling answers we want even from
// users who bounce at the paywall, so the gate sits here — after them, before
// Search Console + MCP setup.
const SUBSCRIBE_GATE_STEP = 3;

const clampStep = (step: number) =>
  Math.min(Math.max(0, Math.trunc(step)), ONBOARDING_LAST_STEP);

export const Route = createFileRoute("/_authenticated/onboarding")({
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

  // Self-hosted has no paywall; hosted users must subscribe before the gated
  // steps. Answers from earlier steps are already saved, so a user who pays
  // returns to the gated step with everything intact.
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

  // Advance to the next step, but divert to the paywall when crossing into the
  // first gated step. The just-saved answers let the user resume here on return.
  const advanceFromCurrentStep = () => {
    const next = clampStep(step + 1);
    if (next >= SUBSCRIBE_GATE_STEP && needsSubscription) {
      void navigate({
        to: SUBSCRIBE_ROUTE,
        search: { redirect: `/onboarding?step=${SUBSCRIBE_GATE_STEP}` },
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
      isSaving={saveMutation.isPending}
      accountMenu={<OnboardingAccountMenu email={email} />}
    />
  );
}

function OnboardingAccountMenu({ email }: { email: string | undefined }) {
  if (!email) return null;

  const handleSignOut = () => signOutAndRedirect();

  return (
    <div className="fixed top-4 right-4">
      <div className="dropdown dropdown-end">
        <button
          type="button"
          tabIndex={0}
          className="btn btn-ghost btn-circle"
          aria-label="Open account menu"
        >
          <User className="h-5 w-5" />
        </button>
        <ul
          tabIndex={0}
          className="dropdown-content z-20 menu mt-3 min-w-56 rounded-box border border-base-300 bg-base-100 p-2 shadow-lg"
        >
          <li className="menu-title max-w-full">
            <span className="truncate text-base-content" data-ph-mask>
              {email}
            </span>
          </li>
          <li>
            <a href="/settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </a>
          </li>
          <ThemePreferenceMenuItems />
          <li>
            <button type="button" onClick={handleSignOut}>
              Sign out
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
