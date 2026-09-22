import { z } from "zod";
import { OnboardingRepository } from "../repositories/OnboardingRepository";
import type { OnboardingAnswersInput } from "@/types/schemas/onboarding";

const interestedFeaturesSchema = z.array(z.string());

function parseInterestedFeatures(value: string | null | undefined) {
  if (!value) return [];

  try {
    const result = interestedFeaturesSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

async function getAnswers(userId: string) {
  const state = await OnboardingRepository.getState(userId);

  return {
    completedAt: state?.completedAt ?? null,
    gscNudgeDismissedAt: state?.gscNudgeDismissedAt ?? null,
    userCreatedAt: state?.userCreatedAt?.toISOString() ?? null,
    answers: {
      interestedFeatures: parseInterestedFeatures(state?.interestedFeatures),
      workFor: state?.workFor ?? null,
      clientWebsiteCount: state?.clientWebsiteCount ?? null,
      foundVia: state?.foundVia ?? null,
      mcpSetupIntent: state?.mcpSetupIntent ?? null,
    },
  };
}

async function saveAnswers(
  userId: string,
  organizationId: string,
  answers: OnboardingAnswersInput,
) {
  const now = new Date().toISOString();
  const { completed, ...answerFields } = answers;
  // Completing onboarding means the user passed the Search Console step, so
  // the legacy re-engagement nudge must not appear afterward.
  await OnboardingRepository.saveAnswers(
    userId,
    organizationId,
    {
      ...answerFields,
      completedAt: completed ? now : undefined,
    },
    now,
  );
}

async function dismissGscNudge(userId: string, organizationId: string) {
  await OnboardingRepository.dismissGscNudge(
    userId,
    organizationId,
    new Date().toISOString(),
  );
}

export const OnboardingService = {
  getAnswers,
  saveAnswers,
  dismissGscNudge,
} as const;
