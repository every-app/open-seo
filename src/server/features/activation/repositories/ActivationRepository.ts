import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  organizationActivationState,
  projectActivationState,
} from "@/db/schema";

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

async function markCompetitorStepClicked(projectId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(projectActivationState)
    .values({ projectId, competitorStepClickedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: projectActivationState.projectId,
      set: {
        competitorStepClickedAt: sql`coalesce(${projectActivationState.competitorStepClickedAt}, ${now})`,
        updatedAt: now,
      },
    });
}

async function markMcpCardDismissed(projectId: string): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(projectActivationState)
    .values({ projectId, mcpCardDismissedAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: projectActivationState.projectId,
      set: {
        mcpCardDismissedAt: sql`coalesce(${projectActivationState.mcpCardDismissedAt}, ${now})`,
        updatedAt: now,
      },
    });
}

export const ActivationRepository = {
  getOrganizationActivation,
  getProjectActivation,
  recordFirstMcpAuthorized,
  recordFirstMcpToolCall,
  markCompetitorStepClicked,
  markMcpCardDismissed,
};
