import { waitUntil } from "cloudflare:workers";
import { eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  billingCustomerStatus,
  organizationActivationState,
} from "@/db/schema";
import { getOrganizationContacts } from "@/server/billing/loops-sync";
import { captureServerError } from "@/server/lib/posthog";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { createTrustpilotInvitation, getTrustpilotAccessToken } from "./client";
import { getTrustpilotConfig } from "./config";

// Trustpilot's rules require inviting everyone the same way at the same
// point, so don't filter on usage, cancellations, support history or
// anything else that tracks how happy someone is.
// https://corporate.trustpilot.com/legal/for-businesses/guidelines-for-businesses

// When this isolate may next look an organization up: never again once it's
// invited (or Trustpilot isn't configured), a few minutes later while it
// isn't paying. Keeps the tool-call hot
// path off the DB.
const nextCheckAt = new Map<string, number>();
const RECHECK_UNPAID_MS = 5 * 60 * 1000;

/**
 * Invites the organization's owner to review OpenSEO on its first MCP tool
 * call while paying, the point Trustpilot advised, once ever per
 * organization. Called on every successful external tool call; never throws,
 * so it can't fail one. Inert until the Trustpilot settings exist (hosted
 * production only).
 *
 * Only the database work runs inline. Trustpilot is called in the
 * background so a slow or failing Trustpilot never delays the tool call. A
 * failed send is reported to PostHog and not retried: the org is already
 * marked invited.
 */
export async function inviteToReviewIfDue(organizationId: string) {
  if (Date.now() < (nextCheckAt.get(organizationId) ?? 0)) return;
  nextCheckAt.set(organizationId, Infinity);
  try {
    const config = await getTrustpilotConfig(getOptionalEnvValue);
    if (!config) return;
    const [org] = await db
      .select({
        isPaying: billingCustomerStatus.isPaying,
        invitedAt: organizationActivationState.trustpilotInvitedAt,
      })
      .from(billingCustomerStatus)
      .leftJoin(
        organizationActivationState,
        eq(
          organizationActivationState.organizationId,
          billingCustomerStatus.organizationId,
        ),
      )
      .where(eq(billingCustomerStatus.organizationId, organizationId))
      .limit(1);
    if (org?.invitedAt) return;
    if (!org?.isPaying) {
      nextCheckAt.set(organizationId, Date.now() + RECHECK_UNPAID_MS);
      return;
    }
    const owner = (await getOrganizationContacts(organizationId)).find(
      (contact) => contact.role === "owner",
    );
    if (!owner) return;
    // Claim the invitation so concurrent calls in other isolates can't send
    // it twice.
    const now = new Date().toISOString();
    const claimed = await db
      .insert(organizationActivationState)
      .values({ organizationId, trustpilotInvitedAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: organizationActivationState.organizationId,
        set: { trustpilotInvitedAt: now, updatedAt: now },
        setWhere: isNull(organizationActivationState.trustpilotInvitedAt),
      })
      .returning({
        organizationId: organizationActivationState.organizationId,
      });
    if (claimed.length === 0) return;

    waitUntil(
      getTrustpilotAccessToken(config)
        .then((accessToken) =>
          createTrustpilotInvitation(config, accessToken, {
            email: owner.email,
            name: owner.name.trim() || owner.email.split("@")[0],
            referenceNumber: `openseo-${organizationId}`,
            tags: ["openseo-subscriber"],
            preferredSendTime: new Date(),
          }),
        )
        .catch((error: unknown) => reportFailure(organizationId, error)),
    );
  } catch (error) {
    nextCheckAt.set(organizationId, Date.now() + RECHECK_UNPAID_MS);
    waitUntil(reportFailure(organizationId, error));
  }
}

async function reportFailure(organizationId: string, error: unknown) {
  console.error("Trustpilot invitation failed", { organizationId, error });
  await captureServerError(error, {
    source: "trustpilot_invitation",
    customer_id: organizationId,
  });
}
