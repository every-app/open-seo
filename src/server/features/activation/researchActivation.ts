import { ActivationRepository } from "@/server/features/activation/repositories/ActivationRepository";
import type { DashboardResearchStep } from "@/types/schemas/dashboard";

// Project steps already recorded (or in flight) in this isolate. Only the
// first research matters, so repeat research skips the DB.
const recordedSteps = new Set<string>();

/**
 * Completes the dashboard checklist's research step, whether the research ran
 * in the app or from an agent. Awaited inline like the MCP milestones, and
 * swallows errors: tracking must never fail research the user already ran.
 */
export async function recordResearchStep(
  projectId: string,
  step: DashboardResearchStep,
): Promise<void> {
  const key = `${projectId}:${step}`;
  if (recordedSteps.has(key)) return;
  recordedSteps.add(key);
  try {
    await ActivationRepository.recordResearch(projectId, step);
  } catch (error) {
    // Allow a retry on a later call rather than losing the milestone.
    recordedSteps.delete(key);
    console.error("activation: recordResearchStep failed", error);
  }
}
