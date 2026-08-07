import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { MIN_BETTER_AUTH_SECRET_LENGTH } from "@/shared/selfhost-checks";

export type BingOAuthClientConfig = {
  clientId: string;
  clientSecret: string;
};

export async function getBingOAuthClientConfig(): Promise<BingOAuthClientConfig | null> {
  const clientId = (await getOptionalEnvValue("BING_CLIENT_ID"))?.trim();
  const clientSecret = (
    await getOptionalEnvValue("BING_CLIENT_SECRET")
  )?.trim();

  if (!clientId || !clientSecret) return null;

  return { clientId, clientSecret };
}

// Self-hosted Bing OAuth needs both the Microsoft OAuth client and
// BETTER_AUTH_SECRET (the latter encrypts OAuth tokens and lets us build the
// Better Auth instance that mints/refreshes them).
export async function hasSelfHostedBingConfig(): Promise<boolean> {
  if (!(await getBingOAuthClientConfig())) return false;

  const secret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  return Boolean(secret && secret.length >= MIN_BETTER_AUTH_SECRET_LENGTH);
}

// Bing's self-hosted fallback uses the API key generated in Bing Webmaster
// Tools → Settings → API Access. It is read at request time and never stored
// in the connection table.
export async function getBingWebmasterApiKey(): Promise<string | null> {
  return (await getOptionalEnvValue("BING_WEBMASTER_API_KEY"))?.trim() ?? null;
}

export async function hasBingWebmasterApiKey(): Promise<boolean> {
  return Boolean(await getBingWebmasterApiKey());
}
