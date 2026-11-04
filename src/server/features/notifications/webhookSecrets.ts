import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { MIN_BETTER_AUTH_SECRET_LENGTH } from "@/shared/selfhost-checks";

async function readEncryptionKey(): Promise<string | null> {
  const secret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  return secret && secret.length >= MIN_BETTER_AUTH_SECRET_LENGTH
    ? secret
    : null;
}

export async function canStoreNotificationWebhooks(): Promise<boolean> {
  return (await readEncryptionKey()) !== null;
}

async function getEncryptionKey(): Promise<string> {
  const secret = await readEncryptionKey();
  if (!secret) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      `Set BETTER_AUTH_SECRET to at least ${MIN_BETTER_AUTH_SECRET_LENGTH} characters to store notification webhooks.`,
    );
  }
  return secret;
}

export async function sealWebhookUrl(webhookUrl: string): Promise<string> {
  const key = await getEncryptionKey();
  return symmetricEncrypt({ key, data: webhookUrl });
}

export async function openWebhookUrl(ciphertext: string): Promise<string> {
  const key = await getEncryptionKey();
  return symmetricDecrypt({ key, data: ciphertext });
}
