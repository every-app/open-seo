import { useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { PlanPageAccountMenu } from "@/client/features/billing/PlanPageAccountMenu";
import { PostSignupOnboarding } from "@/client/features/onboarding/PostSignupOnboarding";
import { projectsQueryOptions } from "@/client/features/projects/projectQueries";
import {
  ONBOARDING_STEPS,
  ONBOARDING_LAST_STEP,
  onboardingAnswersQueryOptions,
} from "@/client/features/onboarding/onboardingModel";
import { captureClientEvent } from "@/client/lib/posthog";
import { queryClient } from "@/client/tanstack-db";
import { useSession } from "@/lib/auth-client";
import { normalizeAuthRedirect } from "@/lib/auth-redirect";
import { saveOnboardingAnswers } from "@/serverFunctions/onboarding";

const clampStep = (step: number) =>
  Math.min(Math.max(0, Math.trunc(step)), ONBOARDING_LAST_STEP);

export const Route = createFileRoute("/_authenticated/onboarding/")({
  // The app renders inside ClientOnly, and this guard reads account-scoped data
  // through a module-scoped query client. Keep it out of server requests so one
  // worker isolate cannot reuse another account's cached onboarding state.
  ssr: false,
  // Step lives in the URL so it survives refresh and works with back/forward.
  // `domain` arrives from sign-up when the visitor checked a site with the
  // marketing site's free keyword tool. `redirect` is the app page the user
  // asked for before useOnboardingRedirect sent them here.
  validateSearch: (
    search: Record<string, unknown>,
  ): { step: number; domain?: string; redirect?: string } => {
    const raw = Number(search.step);
    return {
      step: Number.isFinite(raw) ? clampStep(raw) : 0,
      domain: typeof search.domain === "string" ? search.domain : undefined,
      redirect:
        typeof search.redirect === "string"
          ? normalizeAuthRedirect(search.redirect)
          : undefined,
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
  const navigate = useNavigate();
  const { step, domain, redirect: returnTo } = Route.useSearch();

  const saveMutation = useMutation({
    mutationFn: (extra: { completed?: boolean }) =>
      saveOnboardingAnswers({
        data: extra,
      }),
  });

  // Pageviews drop the query string, `?step=` included, so each step reports
  // itself.
  useEffect(() => {
    captureClientEvent("onboarding:step_viewed", {
      step,
      step_name: ONBOARDING_STEPS[step],
    });
  }, [step]);

  const goToStep = (next: number) =>
    void navigate({
      to: "/onboarding",
      search: { step: clampStep(next), domain, redirect: returnTo },
    });

  const handleNext = () => goToStep(step + 1);

  const handleSkip = () => {
    captureClientEvent("onboarding:step_skipped", {
      step,
      step_name: ONBOARDING_STEPS[step],
    });
    goToStep(step + 1);
  };

  const handleFinish = async () => {
    // Agent setup also finishes on its own once the agent connects, so this
    // can run again while a click's save is still pending.
    if (saveMutation.isPending) return;
    try {
      await saveMutation.mutateAsync({ completed: true });
      // The route guard fetched this query without a mounted observer. Refetch
      // inactive queries too, before the dashboard reads the cached completion.
      await queryClient.invalidateQueries(
        {
          queryKey: ["onboardingAnswers"],
          refetchType: "all",
        },
        { throwOnError: true },
      );
    } catch {
      // Keep the user here to retry; an unsaved completion would redirect back.
      return;
    }
    // Visitors who signed up from the free keyword check came to see the rest
    // of its results, so land them on the saved website's keywords ranking
    // #4-20 instead of the dashboard.
    if (domain) {
      const [project] = await queryClient
        .fetchQuery(projectsQueryOptions())
        .catch(() => []);
      if (project?.domain) {
        void navigate({
          to: "/p/$projectId/domain",
          params: { projectId: project.id },
          search: {
            domain: project.domain,
            minRank: 4,
            maxRank: 20,
            sort: "volume",
          },
          replace: true,
        });
        return;
      }
    }
    void navigate({ href: returnTo ?? "/", replace: true });
  };

  return (
    <PostSignupOnboarding
      step={step}
      onNext={handleNext}
      onBack={() => goToStep(step - 1)}
      onStepChange={goToStep}
      onSkip={handleSkip}
      onFinish={handleFinish}
      suggestedDomain={domain}
      isSaving={saveMutation.isPending}
      accountMenu={<PlanPageAccountMenu email={session?.user?.email} />}
    />
  );
}
