import { eq } from "drizzle-orm";
import { db } from "@/db";
import { member, user } from "@/db/schema";
import { hasOrgPermission } from "@/lib/org-permissions";
import {
  getContactNameParts,
  sendLoopsEvent,
  updateLoopsContact,
} from "@/server/email/loops-client";
import { sha256Hex } from "@/server/lib/audit/ids";
import { captureServerEvent } from "@/server/lib/posthog";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { BillingCustomerStatusSnapshot } from "./customer-status-model";
import type { BillingLifecycleEvent } from "./lifecycle-events";
import { getBillingLoopsContactProperties } from "./loops-contact-properties";

/** Refreshes every member's billing properties in Loops and sends lifecycle
 *  events to the members who can manage billing — the only people who can act
 *  on a failed payment, and the ones who cancelled.
 *
 *  Each event's idempotency key is the event, organization, recipient and the
 *  previous snapshot's timestamp, which is stable across webhook retries, so a
 *  retried send lands in Loops's 24-hour dedup window. Loops caps the key at
 *  100 characters and the raw parts exceed that, so they are hashed. */
export async function syncBillingStatusToLoops({
  snapshot,
  events,
  previousSyncedAt,
}: {
  snapshot: BillingCustomerStatusSnapshot;
  events: BillingLifecycleEvent[];
  previousSyncedAt: string | null;
}) {
  const apiKey = await getOptionalEnvValue("LOOPS_API_KEY");

  if (!apiKey) {
    console.warn("Skipping Loops billing sync: LOOPS_API_KEY is not set");
    return;
  }

  const contacts = await getOrganizationContacts(snapshot.organizationId);
  const billingProperties = getBillingLoopsContactProperties(snapshot);
  const logContext = {
    action: "billing-contact-sync",
    organizationId: snapshot.organizationId,
  };

  for (const contact of contacts) {
    // Properties first: the Loops workflows filter on `billingState` before
    // sending, so the contact must already read past_due/active when the
    // event arrives.
    await updateLoopsContact({
      apiKey,
      payload: {
        email: contact.email,
        userId: contact.userId,
        userGroup: "app-user",
        ...getContactNameParts(contact.name),
        ...billingProperties,
      },
      logContext,
    });

    const canManageBilling = hasOrgPermission(contact.role, {
      billing: ["manage"],
    });
    for (const event of canManageBilling ? events : []) {
      const { duplicate } = await sendLoopsEvent({
        apiKey,
        idempotencyKey: `${event.name}:${await sha256Hex(
          `${snapshot.organizationId}:${contact.userId}:${previousSyncedAt}`,
        )}`,
        payload: {
          email: contact.email,
          userId: contact.userId,
          eventName: event.name,
          eventProperties: { planId: event.planId },
        },
        logContext,
      });
      // Top of the fix-payment funnel, joined in PostHog with the page's
      // viewed/portal_opened/returned/payment_fixed events. A webhook retry
      // that Loops deduplicated sent no email, so it does not count.
      if (event.name === "payment_failed" && !duplicate) {
        await captureServerEvent({
          distinctId: contact.userId,
          event: "billing:payment_failed_email_sent",
          organizationId: snapshot.organizationId,
          properties: { plan_id: event.planId },
        });
      }
    }
  }
}

async function getOrganizationContacts(organizationId: string) {
  return db
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, organizationId));
}
