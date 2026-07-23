import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

async function loadOnboardingDb() {
  const dbSpecifier = "@/db";
  const schemaSpecifier = "@/db/schema";
  const [{ db }, { user, userOnboardingAnswers }] = await Promise.all([
    import(/* @vite-ignore */ dbSpecifier),
    import(/* @vite-ignore */ schemaSpecifier),
  ]);

  return { db, user, userOnboardingAnswers };
}

const onboardingAnswersSchema = z.object({
  interestedFeatures: z.array(z.string()).optional(),
  workFor: z.string().optional(),
  clientWebsiteCount: z.string().optional(),
  foundVia: z.string().optional(),
  mcpSetupIntent: z.enum(["yes", "no"]).optional(),
  completed: z.boolean().optional(),
});

export const getOnboardingAnswers = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    const { db, user, userOnboardingAnswers } = await loadOnboardingDb();
    const answers = await db.query.userOnboardingAnswers.findFirst({
      columns: {
        completedAt: true,
        gscNudgeDismissedAt: true,
        interestedFeatures: true,
        workFor: true,
        clientWebsiteCount: true,
        foundVia: true,
        mcpSetupIntent: true,
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
        mcpSetupIntent: answers?.mcpSetupIntent ?? null,
      },
    };
  });

export const saveOnboardingAnswers = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(onboardingAnswersSchema)
  .handler(async ({ data, context }) => {
    const { db, userOnboardingAnswers } = await loadOnboardingDb();
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
      ...(data.mcpSetupIntent !== undefined
        ? { mcpSetupIntent: data.mcpSetupIntent }
        : {}),
      ...(completedAt !== undefined
        ? { completedAt, gscNudgeDismissedAt: completedAt }
        : {}),
      updatedAt: now,
    };

    await db
      .insert(userOnboardingAnswers)
      .values({
        userId: context.userId,
        organizationId: context.organizationId,
        interestedFeatures: JSON.stringify(data.interestedFeatures ?? []),
        workFor: data.workFor,
        clientWebsiteCount: data.clientWebsiteCount,
        foundVia: data.foundVia,
        mcpSetupIntent: data.mcpSetupIntent,
        completedAt,
        gscNudgeDismissedAt: completedAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: userOnboardingAnswers.userId,
        set,
      });

    return { ok: true };
  });

export const dismissGscNudge = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    const { db, userOnboardingAnswers } = await loadOnboardingDb();
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
