import { db } from "@/db";
import { userOnboardingAnswers } from "@/db/schema";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";

// Runs after an invitation is accepted: point the user's next sign-in at the
// org they just joined, and skip first-run onboarding — the wizard configures
// the org's project (domain, market) and spends org credits, which must not be
// re-run against an already-configured workspace.
export async function onInvitationAccepted(input: {
  userId: string;
  organizationId: string;
}) {
  const now = new Date().toISOString();

  await AuthRepository.setLastActiveOrganization(
    input.userId,
    input.organizationId,
  );

  await db
    .insert(userOnboardingAnswers)
    .values({
      userId: input.userId,
      organizationId: input.organizationId,
      completedAt: now,
      gscNudgeDismissedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userOnboardingAnswers.userId,
      set: {
        completedAt: now,
        gscNudgeDismissedAt: now,
        updatedAt: now,
      },
    });
}
