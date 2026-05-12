import { env } from "cloudflare:workers";

const LOOPS_TRANSACTIONAL_URL = "https://app.loops.so/api/v1/transactional";
const LOOPS_CONTACT_UPDATE_URL = "https://app.loops.so/api/v1/contacts/update";

function getRequiredEnv(name: string) {
  const value: unknown = Reflect.get(env, name);
  const trimmed = typeof value === "string" ? value.trim() : "";

  if (!trimmed) {
    throw new Error(`${name} is required in hosted mode`);
  }

  return trimmed;
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

function getOptionalEnv(name: string) {
  const value: unknown = Reflect.get(env, name);
  const trimmed = typeof value === "string" ? value.trim() : "";

  return trimmed || null;
}

function getContactNameParts(name: string | null | undefined) {
  const trimmedName = name?.trim();

  if (!trimmedName) {
    return {};
  }

  const [firstName, ...lastNameParts] = trimmedName.split(/\s+/);
  const lastName = lastNameParts.join(" ");

  return {
    firstName,
    ...(lastName ? { lastName } : {}),
  };
}

export async function upsertHostedSignupContact({
  userId,
  email,
  name,
}: {
  userId: string;
  email: string;
  name?: string | null;
}) {
  const apiKey = getOptionalEnv("LOOPS_API_KEY");

  if (!apiKey) {
    console.warn(
      "Skipping Loops signup contact sync: LOOPS_API_KEY is not set",
    );
    return;
  }

  const response = await fetch(LOOPS_CONTACT_UPDATE_URL, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      email,
      userId,
      source: "openseo-signup",
      userGroup: "app-user",
      ...getContactNameParts(name),
    }),
  });

  if (response.ok) {
    return;
  }

  const errorPayload = await response.json().catch(() => null);
  console.error("Loops signup contact sync error:", {
    status: response.status,
    email,
    userId,
    errorPayload,
  });

  throw new Error(`Failed to sync Loops signup contact (${response.status})`);
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
