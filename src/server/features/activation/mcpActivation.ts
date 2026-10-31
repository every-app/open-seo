import { waitUntil } from "cloudflare:workers";
import { ActivationRepository } from "@/server/features/activation/repositories/ActivationRepository";
import { markOnboardingMilestone } from "@/server/email/onboarding-drip";
import { captureServerEvent } from "@/server/lib/posthog";

// Orgs whose activation milestones are already recorded (or in flight) in
// this isolate. Only *first* timestamps matter, so after one successful write
// these hot paths (every API-key /mcp request, every external tool call)
// never touch the DB again for that org.
const recordedAuthorizedOrgs = new Set<string>();
const recordedToolCallOrgs = new Set<string>();

/**
 * Milestone writes for the dashboard's MCP activation card. Both are awaited
 * inline by their callers (not waitUntil) so the upsert runs inside the
 * request's DB client scope, and both swallow errors: activation tracking
 * must never fail an OAuth flow or a tool call.
 */
export async function recordMcpAuthorized(
  organizationId: string,
): Promise<void> {
  if (recordedAuthorizedOrgs.has(organizationId)) return;
  recordedAuthorizedOrgs.add(organizationId);
  try {
    await ActivationRepository.recordFirstMcpAuthorized(organizationId);
  } catch (error) {
    // Allow a retry on a later call rather than losing the milestone.
    recordedAuthorizedOrgs.delete(organizationId);
    console.error("activation: recordMcpAuthorized failed", error);
  }
}

export async function recordExternalMcpToolCall(caller: {
  userId: string;
  userEmail: string;
  organizationId: string;
}): Promise<void> {
  if (recordedToolCallOrgs.has(caller.organizationId)) return;
  recordedToolCallOrgs.add(caller.organizationId);
  let first: boolean;
  try {
    first = await ActivationRepository.recordFirstMcpToolCall(
      caller.organizationId,
    );
  } catch (error) {
    // Allow a retry on a later call rather than losing the milestone.
    recordedToolCallOrgs.delete(caller.organizationId);
    console.error("activation: recordExternalMcpToolCall failed", error);
    return;
  }
  // Sent from the organization's first call only, not per isolate: Loops
  // rate-limits the whole team.
  if (first) await markOnboardingMilestone(caller, "mcpToolCalled");
}

/**
 * Tells the onboarding emails that a user connected an agent (OAuth consent
 * or a new API key), and which chat app it runs in. Whether OpenSEO has been
 * used from an agent is per workspace, so connecting in a workspace that
 * already has counts as used: a teammate who joins later isn't asked to try
 * their agent. Best-effort like the milestones above.
 */
export async function markMcpConnected(
  user: { userId: string; userEmail: string; organizationId: string },
  agentProvider?: "claude" | "chatgpt",
): Promise<void> {
  const activation = await ActivationRepository.getOrganizationActivation(
    user.organizationId,
  ).catch((error: unknown) => {
    console.error("activation: markMcpConnected lookup failed", error);
    return null;
  });
  await markOnboardingMilestone(user, "mcpConnected", {
    agentProvider,
    mcpToolCalled: activation?.firstMcpToolCallAt ? true : undefined,
  });
}

/**
 * An agent's first connection or first project finishes the user's
 * onboarding. Reports the completion only from the call that made it.
 * Best-effort like the milestones above: the agent's action already worked.
 */
export async function completeOnboardingFromAgent(
  user: { userId: string; organizationId: string },
  via: "agent_connect" | "agent_project",
): Promise<void> {
  const completed = await ActivationRepository.markOnboardingCompleted(
    user.userId,
    user.organizationId,
  ).catch((error: unknown) => {
    console.error(`activation: onboarding completion (${via}) failed`, error);
    return false;
  });
  if (!completed) return;
  waitUntil(
    captureServerEvent({
      distinctId: user.userId,
      event: "onboarding:completed",
      organizationId: user.organizationId,
      properties: { via },
    }),
  );
}
