import { getOrganizationContacts } from "@/server/billing/loops-sync";
import { captureServerError } from "@/server/lib/posthog";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { createTrustpilotInvitation, getTrustpilotAccessToken } from "./client";
import { getTrustpilotConfig } from "./config";

// Trustpilot's rules require inviting everyone the same way at the same
// point, so don't filter on usage, cancellations, support history or
// anything else that tracks how happy someone is.
// https://corporate.trustpilot.com/legal/for-businesses/guidelines-for-businesses

const SEND_AFTER_SUBSCRIBING_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Asks Trustpilot to invite the organization's owner to review OpenSEO 14
 * days from now (Trustpilot holds the invitation until then). Called when a
 * priced subscription starts. The reference number is per organization, so
 * Trustpilot refuses a second invitation if they subscribe again. Failures
 * are logged, never thrown, so they can't fail the billing webhook. Inert
 * until the Trustpilot settings exist (hosted production only).
 */
export async function inviteNewSubscriberToReview(organizationId: string) {
  const config = await getTrustpilotConfig(getOptionalEnvValue);
  if (!config) return;
  try {
    const contacts = await getOrganizationContacts(organizationId);
    const owner = contacts.find((contact) => contact.role === "owner");
    if (!owner) return;
    await createTrustpilotInvitation(
      config,
      await getTrustpilotAccessToken(config),
      {
        email: owner.email,
        name: owner.name.trim() || owner.email.split("@")[0],
        referenceNumber: `openseo-${organizationId}`,
        tags: ["openseo-subscriber"],
        preferredSendTime: new Date(Date.now() + SEND_AFTER_SUBSCRIBING_MS),
      },
    );
  } catch (error) {
    console.error("Trustpilot invitation failed", { organizationId, error });
    await captureServerError(error, {
      source: "trustpilot_invitation",
      customer_id: organizationId,
    });
  }
}
