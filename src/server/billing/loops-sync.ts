import { eq } from "drizzle-orm";
import { db } from "@/db";
import { member, user } from "@/db/schema";
import {
  getContactNameParts,
  updateLoopsContact,
} from "@/server/email/loops-client";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { BillingCustomerStatusSnapshot } from "./customer-status-model";
import { getBillingLoopsContactProperties } from "./loops-contact-properties";

export async function syncBillingStatusToLoops(
  snapshot: BillingCustomerStatusSnapshot,
) {
  const apiKey = await getOptionalEnvValue("LOOPS_API_KEY");

  if (!apiKey) {
    console.warn(
      "Skipping Loops billing contact sync: LOOPS_API_KEY is not set",
    );
    return;
  }

  const contacts = await getOrganizationContacts(snapshot.organizationId);
  const billingProperties = getBillingLoopsContactProperties(snapshot);

  for (const contact of contacts) {
    await updateLoopsContact({
      apiKey,
      payload: {
        email: contact.email,
        userId: contact.userId,
        userGroup: "app-user",
        ...getContactNameParts(contact.name),
        ...billingProperties,
      },
      logContext: {
        action: "billing-contact-sync",
        organizationId: snapshot.organizationId,
      },
    });
  }
}

async function getOrganizationContacts(organizationId: string) {
  return db
    .select({
      userId: user.id,
      email: user.email,
      name: user.name,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, organizationId));
}
