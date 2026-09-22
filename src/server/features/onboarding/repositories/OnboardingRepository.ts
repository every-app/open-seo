import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user, userOnboardingAnswers } from "@/db/schema";

type SavedAnswers = {
  interestedFeatures?: string[];
  workFor?: string;
  clientWebsiteCount?: string;
  foundVia?: string;
  mcpSetupIntent?: "yes" | "no";
  completedAt?: string;
};

async function getState(userId: string) {
  const [row] = await db
    .select({
      completedAt: userOnboardingAnswers.completedAt,
      gscNudgeDismissedAt: userOnboardingAnswers.gscNudgeDismissedAt,
      interestedFeatures: userOnboardingAnswers.interestedFeatures,
      workFor: userOnboardingAnswers.workFor,
      clientWebsiteCount: userOnboardingAnswers.clientWebsiteCount,
      foundVia: userOnboardingAnswers.foundVia,
      mcpSetupIntent: userOnboardingAnswers.mcpSetupIntent,
      userCreatedAt: user.createdAt,
    })
    .from(user)
    .leftJoin(userOnboardingAnswers, eq(userOnboardingAnswers.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);

  return row ?? null;
}

async function saveAnswers(
  userId: string,
  organizationId: string,
  answers: SavedAnswers,
  now: string,
) {
  const set = {
    ...(answers.interestedFeatures
      ? { interestedFeatures: JSON.stringify(answers.interestedFeatures) }
      : {}),
    ...(answers.workFor !== undefined ? { workFor: answers.workFor } : {}),
    ...(answers.clientWebsiteCount !== undefined
      ? { clientWebsiteCount: answers.clientWebsiteCount }
      : {}),
    ...(answers.foundVia !== undefined ? { foundVia: answers.foundVia } : {}),
    ...(answers.mcpSetupIntent !== undefined
      ? { mcpSetupIntent: answers.mcpSetupIntent }
      : {}),
    ...(answers.completedAt !== undefined
      ? {
          completedAt: answers.completedAt,
          gscNudgeDismissedAt: answers.completedAt,
        }
      : {}),
    updatedAt: now,
  };

  await db
    .insert(userOnboardingAnswers)
    .values({
      userId,
      organizationId,
      interestedFeatures: JSON.stringify(answers.interestedFeatures ?? []),
      workFor: answers.workFor,
      clientWebsiteCount: answers.clientWebsiteCount,
      foundVia: answers.foundVia,
      mcpSetupIntent: answers.mcpSetupIntent,
      completedAt: answers.completedAt,
      gscNudgeDismissedAt: answers.completedAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userOnboardingAnswers.userId,
      set,
    });
}

async function dismissGscNudge(
  userId: string,
  organizationId: string,
  now: string,
) {
  await db
    .insert(userOnboardingAnswers)
    .values({
      userId,
      organizationId,
      gscNudgeDismissedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userOnboardingAnswers.userId,
      set: { gscNudgeDismissedAt: now, updatedAt: now },
    });
}

export const OnboardingRepository = {
  getState,
  saveAnswers,
  dismissGscNudge,
} as const;
