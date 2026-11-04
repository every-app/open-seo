import { and, eq, gt, inArray, min, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  dashboardStepDismissals,
  member,
  invitation,
  organizationActivationState,
  projectActivationState,
  projects,
  userOnboardingAnswers,
} from "@/db/schema";

import type {
  DashboardResearchStep,
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

// Returns whether this was the organization's first call.
async function recordFirstMcpToolCall(
  organizationId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const [row] = await db
    .insert(organizationActivationState)
    .values({ organizationId, firstMcpToolCallAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: organizationActivationState.organizationId,
      set: {
        firstMcpToolCallAt: sql`coalesce(${organizationActivationState.firstMcpToolCallAt}, ${now})`,
        updatedAt: now,
      },
    })
    .returning({
      firstMcpToolCallAt: organizationActivationState.firstMcpToolCallAt,
    });
  return row?.firstMcpToolCallAt === now;
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

const researchStepColumns = {
  competitor: "competitorResearchedAt",
  keywords: "keywordResearchedAt",
} as const satisfies Record<
  DashboardResearchStep,
  keyof ProjectActivationState
>;

async function recordResearch(
  projectId: string,
  step: DashboardResearchStep,
): Promise<void> {
  const now = new Date().toISOString();
  const key = researchStepColumns[step];
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

// The first research of each kind on any of the workspace's projects.
async function getWorkspaceResearch(organizationId: string) {
  const [row] = await db
    .select({
      competitorResearchedAt: min(
        projectActivationState.competitorResearchedAt,
      ),
      keywordResearchedAt: min(projectActivationState.keywordResearchedAt),
    })
    .from(projectActivationState)
    .innerJoin(projects, eq(projects.id, projectActivationState.projectId))
    .where(eq(projects.organizationId, organizationId));
  return {
    competitorResearchedAt: row?.competitorResearchedAt ?? null,
    keywordResearchedAt: row?.keywordResearchedAt ?? null,
  };
}

// How dismissals are stored. Before the agent card and the checklist's agent
// step were split, dismissing either one stored "mcp" (or, earlier, set the
// project's mcp_card_dismissed_at), which still hides both. Since then the
// step's skip stores "agent_step" and the card's X "agent_card"; every other
// step stores its own id.
const LEGACY_AGENT_DISMISSAL = "mcp";
const AGENT_STEP_DISMISSAL = "agent_step";
const AGENT_CARD_DISMISSAL = "agent_card";

function storedStep(step: DashboardSetupStep) {
  return step === "mcp" ? AGENT_STEP_DISMISSAL : step;
}

// A dismissal made on one project applies on every project in that
// workspace. Each row keeps the project it was made from.
async function getDismissals(input: {
  userId: string;
  organizationId: string;
  projectId: string;
}) {
  const [rows, project] = await Promise.all([
    db
      .selectDistinct({ key: dashboardStepDismissals.step })
      .from(dashboardStepDismissals)
      .innerJoin(projects, eq(projects.id, dashboardStepDismissals.projectId))
      .where(
        and(
          eq(dashboardStepDismissals.userId, input.userId),
          eq(projects.organizationId, input.organizationId),
        ),
      ),
    getProjectActivation(input.projectId),
  ]);
  const keys = rows.map((row) => row.key);
  const legacyAgent =
    keys.includes(LEGACY_AGENT_DISMISSAL) ||
    project?.mcpCardDismissedAt != null;
  const skippedSteps = keys.filter(
    (key) =>
      key !== AGENT_CARD_DISMISSAL &&
      key !== AGENT_STEP_DISMISSAL &&
      key !== LEGACY_AGENT_DISMISSAL,
  );
  return {
    skippedSteps:
      legacyAgent || keys.includes(AGENT_STEP_DISMISSAL)
        ? [...skippedSteps, "mcp"]
        : skippedSteps,
    agentCardDismissed: legacyAgent || keys.includes(AGENT_CARD_DISMISSAL),
  };
}

async function setStepDismissed(input: {
  userId: string;
  organizationId: string;
  projectId: string;
  step: DashboardSetupStep;
  dismissed: boolean;
}) {
  const { userId, organizationId, projectId, step } = input;
  if (input.dismissed) {
    await db
      .insert(dashboardStepDismissals)
      .values({ userId, projectId, step: storedStep(step) })
      .onConflictDoNothing();
    return;
  }
  // Restoring the agent step also clears dismissals from before the agent card
  // and step were split, which hid both.
  if (step === "mcp") {
    await db
      .update(projectActivationState)
      .set({ mcpCardDismissedAt: null })
      .where(eq(projectActivationState.projectId, projectId));
  }
  // A restore clears the skip from every project in the workspace.
  await db
    .delete(dashboardStepDismissals)
    .where(
      and(
        eq(dashboardStepDismissals.userId, userId),
        inArray(
          dashboardStepDismissals.step,
          step === "mcp"
            ? [AGENT_STEP_DISMISSAL, LEGACY_AGENT_DISMISSAL]
            : [step],
        ),
        inArray(
          dashboardStepDismissals.projectId,
          db
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.organizationId, organizationId)),
        ),
      ),
    );
}

// Hides only the agent card, never the checklist's agent step.
async function dismissAgentCard(userId: string, projectId: string) {
  await db
    .insert(dashboardStepDismissals)
    .values({ userId, projectId, step: AGENT_CARD_DISMISSAL })
    .onConflictDoNothing();
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
  getDismissals,
  setStepDismissed,
  dismissAgentCard,
  hasTeammate,
  getOrganizationActivation,
  getProjectActivation,
  getWorkspaceResearch,
  recordFirstMcpAuthorized,
  recordFirstMcpToolCall,
  markOnboardingCompleted,
  recordResearch,
  markGa4CardDismissed,
};
