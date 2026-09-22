import { createServerFn } from "@tanstack/react-start";
import { OnboardingService } from "@/server/features/onboarding/services/OnboardingService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import { onboardingAnswersSchema } from "@/types/schemas/onboarding";

export const getOnboardingAnswers = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(({ context }) => OnboardingService.getAnswers(context.userId));

export const saveOnboardingAnswers = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(onboardingAnswersSchema)
  .handler(async ({ data, context }) => {
    await OnboardingService.saveAnswers(
      context.userId,
      context.organizationId,
      data,
    );
    return { ok: true };
  });

// Records that the one-time "connect Search Console" nudge has been shown and
// resolved (dismissed or acted on) so it never reappears for this user.
export const dismissGscNudge = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    await OnboardingService.dismissGscNudge(
      context.userId,
      context.organizationId,
    );
    return { ok: true };
  });
