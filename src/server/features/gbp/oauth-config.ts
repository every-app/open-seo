import { getOptionalEnvValue } from "@/server/lib/runtime-env";

type GbpOAuthClientConfig = {
  clientId: string;
  clientSecret: string;
};

export async function getGbpOAuthClientConfig(): Promise<GbpOAuthClientConfig | null> {
  const clientId = (await getOptionalEnvValue("GOOGLE_CLIENT_ID"))?.trim();
  const clientSecret = (
    await getOptionalEnvValue("GOOGLE_CLIENT_SECRET")
  )?.trim();

  if (!clientId || !clientSecret) return null;

  return { clientId, clientSecret };
}

// Self-hosted Business Profile needs the same Google OAuth client AND
// BETTER_AUTH_SECRET (>=32 chars) as Search Console: the secret keys
// OAuth-token encryption and lets us build the Better Auth instance that
// mints/refreshes tokens. Both must be set before we surface the connect flow.
export async function hasSelfHostedGbpConfig(): Promise<boolean> {
  if (!(await getGbpOAuthClientConfig())) return false;

  const secret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  return Boolean(secret && secret.length >= 32);
}
