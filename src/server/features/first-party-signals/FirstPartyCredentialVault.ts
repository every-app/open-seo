import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { getAuth } from "@/lib/auth";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { MIN_BETTER_AUTH_SECRET_LENGTH } from "@/shared/selfhost-checks";

async function isConfigured(): Promise<boolean> {
  const secret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  return Boolean(secret && secret.length >= MIN_BETTER_AUTH_SECRET_LENGTH);
}

async function encrypt(value: string): Promise<string> {
  const context = await getAuth().$context;
  return symmetricEncrypt({ key: context.secretConfig, data: value });
}

async function decrypt(value: string): Promise<string> {
  const context = await getAuth().$context;
  return symmetricDecrypt({ key: context.secretConfig, data: value });
}

export const FirstPartyCredentialVault = { isConfigured, encrypt, decrypt };
