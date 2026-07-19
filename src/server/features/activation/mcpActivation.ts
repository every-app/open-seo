import { ActivationRepository } from "@/server/features/activation/repositories/ActivationRepository";

// Orgs whose first external MCP tool call is already recorded (or in flight)
// in this isolate. Only *first* timestamps matter, so after one successful
// write the tool-call hot path never touches the DB again for that org.
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
  try {
    await ActivationRepository.recordFirstMcpAuthorized(organizationId);
  } catch (error) {
    console.error("activation: recordMcpAuthorized failed", error);
  }
}

export async function recordExternalMcpToolCall(
  organizationId: string,
): Promise<void> {
  if (recordedToolCallOrgs.has(organizationId)) return;
  recordedToolCallOrgs.add(organizationId);
  try {
    await ActivationRepository.recordFirstMcpToolCall(organizationId);
  } catch (error) {
    // Allow a retry on a later call rather than losing the milestone.
    recordedToolCallOrgs.delete(organizationId);
    console.error("activation: recordExternalMcpToolCall failed", error);
  }
}
