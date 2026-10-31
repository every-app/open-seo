import { waitUntil } from "cloudflare:workers";
import {
  sendLoopsEvent,
  updateLoopsContact,
} from "@/server/email/loops-client";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

/**
 * Server half of the onboarding email drip. Loops owns the timing, filters and
 * copy; the server only reports what a user has done. Milestones land as
 * contact properties the drip's emails filter on, and emails that react to
 * something happening are sent as events (the first audit's results go from
 * firstAuditEmails.ts). Every send is best-effort: a Loops outage must never
 * fail the action that triggered it.
 */

type OnboardingRecipient = { userId: string; userEmail: string };

type OnboardingMilestone =
  | "auditStarted"
  | "gscConnected"
  | "rankTrackingSetUp"
  | "mcpConnected"
  | "mcpToolCalled";

export async function markOnboardingMilestone(
  recipient: OnboardingRecipient,
  milestone: OnboardingMilestone,
  // Set alongside the milestone for its emails (see markMcpConnected).
  properties: {
    agentProvider?: "claude" | "chatgpt";
    mcpToolCalled?: true;
  } = {},
) {
  await sendOnce(`${milestone}:${recipient.userId}`, (apiKey) =>
    updateLoopsContact({
      apiKey,
      payload: {
        email: recipient.userEmail,
        userId: recipient.userId,
        [milestone]: true,
        ...properties,
      },
      logContext: { action: "onboarding-milestone", milestone },
    }),
  );
}

// Scheduled rank and AI visibility checks run as this placeholder user
// (scheduledRankChecks.ts, scheduledAiVisibility.ts), so a refusal on one of
// them goes to the organization's owner.
const SCHEDULED_RUN_USER_ID = "system";

export async function sendCreditsExhaustedEvent(
  customer: OnboardingRecipient & { organizationId: string },
) {
  const recipient =
    customer.userId === SCHEDULED_RUN_USER_ID
      ? await findOrganizationOwner(customer.organizationId)
      : customer;
  if (!recipient) return;
  const key = `credits_exhausted:${recipient.userId}:${new Date().toISOString().slice(0, 10)}`;
  await sendOnce(key, (apiKey) =>
    sendLoopsEvent({
      apiKey,
      idempotencyKey: key,
      payload: {
        email: recipient.userEmail,
        userId: recipient.userId,
        eventName: "credits_exhausted",
      },
    }),
  );
}

// Imported lazily, as in captureServerEvent: most importers only report
// events and shouldn't load the database client. Scoped because Workflow
// steps run outside a request's Postgres scope.
async function findOrganizationOwner(
  organizationId: string,
): Promise<OnboardingRecipient | null> {
  try {
    const [{ withPgClient }, { AuthRepository }] = await Promise.all([
      import("@/db"),
      import("@/server/auth/repositories/AuthRepository"),
    ]);
    const owner = await withPgClient(() =>
      AuthRepository.getOrganizationOwner(organizationId),
    );
    return owner ? { userId: owner.id, userEmail: owner.email } : null;
  } catch (error) {
    console.error("onboarding drip: organization owner lookup failed", error);
    return null;
  }
}

// Some callers are hot paths (every request refused for credits), and Loops
// rate-limits the whole team, transactional emails included. So each isolate
// sends each update once.
const sentKeys = new Set<string>();

async function sendOnce(
  key: string,
  send: (apiKey: string) => Promise<unknown>,
) {
  if (sentKeys.has(key)) return;
  const apiKey = await getOptionalEnvValue("LOOPS_API_KEY");
  if (!apiKey) return;
  sentKeys.add(key);
  const work = send(apiKey).catch((error: unknown) => {
    console.error(`onboarding drip: ${key} failed`, error);
  });
  try {
    waitUntil(work);
  } catch {
    // No request context (Workflow step): wait for the send instead.
    await work;
  }
}
