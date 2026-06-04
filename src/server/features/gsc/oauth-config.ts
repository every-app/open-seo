import { getOptionalEnvValue } from "@/server/lib/runtime-env";

type GscOAuthClientConfig = {
  clientId: string;
  clientSecret: string;
};

export async function getGscOAuthClientConfig(): Promise<GscOAuthClientConfig | null> {
  const clientId = (await getOptionalEnvValue("GOOGLE_CLIENT_ID"))?.trim();
  const clientSecret = (
    await getOptionalEnvValue("GOOGLE_CLIENT_SECRET")
  )?.trim();

  if (!clientId || !clientSecret) return null;

  return { clientId, clientSecret };
}

// Self-hosted Search Console needs the Google OAuth client AND BETTER_AUTH_SECRET
// (>=32 chars): the secret keys OAuth-token encryption and lets us build the
// Better Auth instance that mints/refreshes tokens. Both must be set before we
// surface the connect flow.
export async function hasSelfHostedGscConfig(): Promise<boolean> {
  if (!(await getGscOAuthClientConfig())) return false;

  const secret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  return Boolean(secret && secret.length >= 32);
}
