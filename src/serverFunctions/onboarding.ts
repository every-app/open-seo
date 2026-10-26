import { waitUntil } from "cloudflare:workers";
import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { user, userOnboardingAnswers } from "@/db/schema";
import { db } from "@/db";
import { ActivationRepository } from "@/server/features/activation/repositories/ActivationRepository";
import { captureServerEvent } from "@/server/lib/posthog";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

const onboardingAnswersSchema = z.object({
  interestedFeatures: z.array(z.string()).optional(),
  workFor: z.string().optional(),
  clientWebsiteCount: z.string().optional(),
  foundVia: z.string().optional(),
  completed: z.boolean().optional(),
});

export const getOnboardingAnswers = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    const answers = await db.query.userOnboardingAnswers.findFirst({
      columns: {
        completedAt: true,
        gscNudgeDismissedAt: true,
        interestedFeatures: true,
        workFor: true,
        clientWebsiteCount: true,
        foundVia: true,
      },
      where: eq(userOnboardingAnswers.userId, context.userId),
    });
    const userRecord = await db.query.user.findFirst({
      columns: {
        createdAt: true,
      },
      where: eq(user.id, context.userId),
    });

    let interestedFeatures: string[] = [];
    if (answers?.interestedFeatures) {
      try {
        const parsed: unknown = JSON.parse(answers.interestedFeatures);
        if (Array.isArray(parsed)) {
          interestedFeatures = parsed.filter(
            (value): value is string => typeof value === "string",
          );
        }
      } catch {
        interestedFeatures = [];
      }
    }

    return {
      completedAt: answers?.completedAt ?? null,
      gscNudgeDismissedAt: answers?.gscNudgeDismissedAt ?? null,
      userCreatedAt: userRecord?.createdAt?.toISOString() ?? null,
      answers: {
        interestedFeatures,
        workFor: answers?.workFor ?? null,
        clientWebsiteCount: answers?.clientWebsiteCount ?? null,
        foundVia: answers?.foundVia ?? null,
      },
    };
  });

// The onboarding Agent setup step polls this to see when an agent connects.
export const getMcpAuthorizedAt = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    const activation = await ActivationRepository.getOrganizationActivation(
      context.organizationId,
    );
    return { authorizedAt: activation?.firstMcpAuthorizedAt ?? null };
  });

export const saveOnboardingAnswers = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(onboardingAnswersSchema)
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const completedAt = data.completed ? now : undefined;
    const set = {
      ...(data.interestedFeatures
        ? { interestedFeatures: JSON.stringify(data.interestedFeatures) }
        : {}),
      ...(data.workFor !== undefined ? { workFor: data.workFor } : {}),
      ...(data.clientWebsiteCount !== undefined
        ? { clientWebsiteCount: data.clientWebsiteCount }
        : {}),
      ...(data.foundVia !== undefined ? { foundVia: data.foundVia } : {}),
      // Completing onboarding means the user passed the Search Console step, so
      // resolve the GSC prompt — the legacy re-engagement nudge must not fire
      // for anyone who already saw that step. COALESCE keeps an earlier
      // completion, such as an agent's create_project.
      ...(completedAt !== undefined
        ? {
            completedAt: sql`coalesce(${userOnboardingAnswers.completedAt}, ${completedAt})`,
            gscNudgeDismissedAt: completedAt,
          }
        : {}),
      updatedAt: now,
    };

    const [saved] = await db
      .insert(userOnboardingAnswers)
      .values({
        userId: context.userId,
        organizationId: context.organizationId,
        interestedFeatures: JSON.stringify(data.interestedFeatures ?? []),
        workFor: data.workFor,
        clientWebsiteCount: data.clientWebsiteCount,
        foundVia: data.foundVia,
        completedAt,
        gscNudgeDismissedAt: completedAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userOnboardingAnswers.userId,
        set,
      })
      .returning({ completedAt: userOnboardingAnswers.completedAt });

    if (completedAt && saved?.completedAt === completedAt) {
      waitUntil(
        captureServerEvent({
          distinctId: context.userId,
          event: "onboarding:completed",
          organizationId: context.organizationId,
          properties: { via: "wizard" },
        }),
      );
    }

    return { ok: true };
  });

// Records that the one-time "connect Search Console" nudge has been shown and
// resolved (dismissed or acted on) so it never reappears for this user.
export const dismissGscNudge = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    const now = new Date().toISOString();
    await db
      .insert(userOnboardingAnswers)
      .values({
        userId: context.userId,
        organizationId: context.organizationId,
        gscNudgeDismissedAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userOnboardingAnswers.userId,
        set: { gscNudgeDismissedAt: now, updatedAt: now },
      });

    return { ok: true };
  });
