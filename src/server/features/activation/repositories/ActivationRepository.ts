import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  dashboardStepDismissals,
  member,
  invitation,
  organizationActivationState,
  projectActivationState,
  userOnboardingAnswers,
} from "@/db/schema";

import type {
  DashboardClickStep,
  DashboardSetupStep,
} from "@/types/schemas/dashboard";

type OrganizationActivationState =
  typeof organizationActivationState.$inferSelect;
type ProjectActivationState = typeof projectActivationState.$inferSelect;

async function getOrganizationActivation(
  organizationId: string,
): Promise<OrganizationActivationState | null> {
  const rows = await db
    .select()
    .from(organizationActivationState)
    .where(eq(organizationActivationState.organizationId, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

async function getProjectActivation(
  projectId: string,
): Promise<ProjectActivationState | null> {
  const rows = await db
    .select()
    .from(projectActivationState)
    .where(eq(projectActivationState.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

// First-occurrence timestamps only: concurrent writers race harmlessly because
// COALESCE keeps whichever value landed first.
async function recordFirstMcpAuthorized(organizationId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(organizationActivationState)
    .values({ organizationId, firstMcpAuthorizedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: organizationActivationState.organizationId,
      set: {
        firstMcpAuthorizedAt: sql`coalesce(${organizationActivationState.firstMcpAuthorizedAt}, ${now})`,
        updatedAt: now,
      },
    });
}

async function recordFirstMcpToolCall(organizationId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(organizationActivationState)
    .values({ organizationId, firstMcpToolCallAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: organizationActivationState.organizationId,
      set: {
        firstMcpToolCallAt: sql`coalesce(${organizationActivationState.firstMcpToolCallAt}, ${now})`,
        updatedAt: now,
      },
    });
}

// An agent that creates a project through MCP has done the wizard's main job,
// so the app stops sending the user to onboarding. COALESCE keeps an earlier
// completion. The Search Console nudge stays pending: the user never saw that
// step. Returns whether this call completed onboarding.
async function markOnboardingCompleted(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(userOnboardingAnswers)
    .values({ userId, organizationId, completedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: userOnboardingAnswers.userId,
      set: {
        completedAt: sql`coalesce(${userOnboardingAnswers.completedAt}, ${now})`,
        updatedAt: now,
      },
    })
    .returning({ completedAt: userOnboardingAnswers.completedAt });
  return row?.completedAt === now;
}

const clickStepColumns = {
  competitor: "competitorStepClickedAt",
  keywords: "keywordStepClickedAt",
} as const satisfies Record<DashboardClickStep, keyof ProjectActivationState>;

async function markStepClicked(
  projectId: string,
  step: DashboardClickStep,
): Promise<void> {
  const now = new Date().toISOString();
  const key = clickStepColumns[step];
  await db
    .insert(projectActivationState)
    .values({ projectId, [key]: now, updatedAt: now })
    .onConflictDoUpdate({
      target: projectActivationState.projectId,
      set: {
        [key]: sql`coalesce(${projectActivationState[key]}, ${now})`,
        updatedAt: now,
      },
    });
}

async function markGa4CardDismissed(projectId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(projectActivationState)
    .values({ projectId, ga4CardDismissedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: projectActivationState.projectId,
      set: {
        ga4CardDismissedAt: sql`coalesce(${projectActivationState.ga4CardDismissedAt}, ${now})`,
        updatedAt: now,
      },
    });
}

async function getDismissedSteps(userId: string, projectId: string) {
  return db
    .select({ step: dashboardStepDismissals.step })
    .from(dashboardStepDismissals)
    .where(
      and(
        eq(dashboardStepDismissals.userId, userId),
        eq(dashboardStepDismissals.projectId, projectId),
      ),
    );
}

async function setStepDismissed(
  userId: string,
  projectId: string,
  step: DashboardSetupStep,
  dismissed: boolean,
) {
  if (dismissed) {
    await db
      .insert(dashboardStepDismissals)
      .values({ userId, projectId, step })
      .onConflictDoNothing();
  } else {
    if (step === "mcp") {
      await db
        .update(projectActivationState)
        .set({ mcpCardDismissedAt: null })
        .where(eq(projectActivationState.projectId, projectId));
    }
    await db
      .delete(dashboardStepDismissals)
      .where(
        and(
          eq(dashboardStepDismissals.userId, userId),
          eq(dashboardStepDismissals.projectId, projectId),
          eq(dashboardStepDismissals.step, step),
        ),
      );
  }
}

// Return only the milestone, never member or invitee details to the dashboard.
async function hasTeammate(organizationId: string) {
  const [members, pending] = await Promise.all([
    db
      .select({ id: member.id })
      .from(member)
      .where(eq(member.organizationId, organizationId))
      .limit(2),
    db
      .select({ id: invitation.id })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, organizationId),
          eq(invitation.status, "pending"),
          gt(invitation.expiresAt, new Date()),
        ),
      )
      .limit(1),
  ]);
  return members.length > 1 || pending.length > 0;
}

export const ActivationRepository = {
  getDismissedSteps,
  setStepDismissed,
  hasTeammate,
  getOrganizationActivation,
  getProjectActivation,
  recordFirstMcpAuthorized,
  recordFirstMcpToolCall,
  markOnboardingCompleted,
  markStepClicked,
  markGa4CardDismissed,
};
