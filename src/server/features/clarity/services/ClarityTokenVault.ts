import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { getAuth } from "@/lib/auth";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { MIN_BETTER_AUTH_SECRET_LENGTH } from "@/shared/selfhost-checks";

async function isConfigured(): Promise<boolean> {
  const secret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  return Boolean(secret && secret.length >= MIN_BETTER_AUTH_SECRET_LENGTH);
}

async function encrypt(apiToken: string): Promise<string> {
  const context = await getAuth().$context;
  return symmetricEncrypt({ key: context.secretConfig, data: apiToken });
}

async function decrypt(encryptedApiToken: string): Promise<string> {
  const context = await getAuth().$context;
  return symmetricDecrypt({
    key: context.secretConfig,
    data: encryptedApiToken,
  });
}

export const ClarityTokenVault = { isConfigured, encrypt, decrypt };
