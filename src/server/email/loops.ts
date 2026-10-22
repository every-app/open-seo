import { env } from "cloudflare:workers";
import {
  getContactNameParts,
  updateLoopsContact,
} from "@/server/email/loops-client";

const LOOPS_TRANSACTIONAL_URL = "https://app.loops.so/api/v1/transactional";

function getOptionalEnv(name: string) {
  const value: unknown = Reflect.get(env, name);
  const trimmed = typeof value === "string" ? value.trim() : "";

  return trimmed || null;
}

function getRequiredEnv(name: string) {
  const value = getOptionalEnv(name);

  if (!value) {
    throw new Error(`${name} is required in hosted mode`);
  }

  return value;
}

function getHostedAuthEmailConfig() {
  return {
    apiKey: getRequiredEnv("LOOPS_API_KEY"),
    verificationTemplateId: getRequiredEnv(
      "LOOPS_TRANSACTIONAL_VERIFY_EMAIL_ID",
    ),
    passwordResetTemplateId: getRequiredEnv(
      "LOOPS_TRANSACTIONAL_RESET_PASSWORD_ID",
    ),
  };
}

async function sendLoopsTransactionalEmail({
  apiKey,
  email,
  transactionalId,
  dataVariables,
}: {
  apiKey: string;
  email: string;
  transactionalId: string;
  dataVariables: Record<string, string>;
}) {
  const response = await fetch(LOOPS_TRANSACTIONAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      transactionalId,
      email,
      addToAudience: false,
      dataVariables,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (response.ok) {
    return;
  }

  const errorPayload = await response.json().catch(() => null);
  console.error("Loops transactional email error:", {
    status: response.status,
    email,
    transactionalId,
    errorPayload,
  });

  throw new Error(
    `Failed to send Loops transactional email (${response.status})`,
  );
}

export async function upsertHostedSignupContact({
  userId,
  email,
  name,
  productUpdates,
}: {
  userId: string;
  email: string;
  name?: string | null;
  productUpdates: boolean;
}) {
  const apiKey = getOptionalEnv("LOOPS_API_KEY");

  if (!apiKey) {
    console.warn(
      "Skipping Loops signup contact sync: LOOPS_API_KEY is not set",
    );
    return;
  }

  const listId = getOptionalEnv("LOOPS_PRODUCT_UPDATES_LIST_ID");
  if (!listId) {
    console.warn(
      "Skipping the Loops product updates list at signup: LOOPS_PRODUCT_UPDATES_LIST_ID is not set",
    );
  }

  await updateLoopsContact({
    apiKey,
    payload: {
      email,
      userId,
      source: "openseo-signup",
      userGroup: "app-user",
      ...getContactNameParts(name),
      // Only ever adds: someone who joined the list through the website's
      // newsletter form stays on it until they turn updates off in the app.
      ...(listId && productUpdates ? { mailingLists: { [listId]: true } } : {}),
    },
    logContext: { action: "signup-contact-sync" },
  });
}

/** Adds the contact to the product updates list or removes it. Turning
 *  updates off leaves `subscribed` alone, because lifecycle emails depend on
 *  it; turning them on also resubscribes a contact who once unsubscribed from
 *  everything, since Loops won't email list members who are unsubscribed. */
export async function updateProductUpdatesSubscription({
  userId,
  email,
  optIn,
}: {
  userId: string;
  email: string;
  optIn: boolean;
}) {
  const apiKey = getOptionalEnv("LOOPS_API_KEY");
  const listId = getOptionalEnv("LOOPS_PRODUCT_UPDATES_LIST_ID");

  if (!apiKey || !listId) {
    console.warn(
      "Skipping Loops product updates sync: LOOPS_API_KEY or LOOPS_PRODUCT_UPDATES_LIST_ID is not set",
    );
    return;
  }

  await updateLoopsContact({
    apiKey,
    payload: {
      email,
      userId,
      mailingLists: { [listId]: optIn },
      ...(optIn ? { subscribed: true } : {}),
    },
    logContext: { action: "product-updates-sync" },
  });
}

export async function sendHostedVerificationEmail({
  email,
  confirmationUrl,
}: {
  email: string;
  confirmationUrl: string;
}) {
  const config = getHostedAuthEmailConfig();
  await sendLoopsTransactionalEmail({
    apiKey: config.apiKey,
    email,
    transactionalId: config.verificationTemplateId,
    dataVariables: {
      appName: "OpenSEO",
      confirmationUrl,
    },
  });
}

export async function sendHostedInvitationEmail({
  email,
  inviteUrl,
  organizationName,
  inviterName,
  inviterEmail,
}: {
  email: string;
  inviteUrl: string;
  organizationName: string;
  inviterName: string;
  inviterEmail: string;
}) {
  // Not part of getHostedAuthEmailConfig(): that trio gates hasHostedAuthConfig
  // and adding a new required var there would brick existing deployments.
  const apiKey = getRequiredEnv("LOOPS_API_KEY");
  const templateId = getRequiredEnv("LOOPS_TRANSACTIONAL_INVITATION_ID");
  await sendLoopsTransactionalEmail({
    apiKey,
    email,
    transactionalId: templateId,
    dataVariables: {
      appName: "OpenSEO",
      inviteUrl,
      organizationName,
      inviterName,
      inviterEmail,
    },
  });
}

export async function sendHostedPasswordResetEmail({
  email,
  resetUrl,
}: {
  email: string;
  resetUrl: string;
}) {
  const config = getHostedAuthEmailConfig();
  await sendLoopsTransactionalEmail({
    apiKey: config.apiKey,
    email,
    transactionalId: config.passwordResetTemplateId,
    dataVariables: {
      appName: "OpenSEO",
      resetUrl,
    },
  });
}
