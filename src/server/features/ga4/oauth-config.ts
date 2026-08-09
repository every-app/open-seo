import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { MIN_BETTER_AUTH_SECRET_LENGTH } from "@/shared/selfhost-checks";

type Ga4OAuthClientConfig = {
  clientId: string;
  clientSecret: string;
};

// Reuses the same Google OAuth client already configured for Search Console —
// GOOGLE_CLIENT_ID/SECRET are generic, not GSC-specific. What differs is the
// scope requested (see GA4_OAUTH_SCOPES) and the connection this grant feeds.
export async function getGa4OAuthClientConfig(): Promise<Ga4OAuthClientConfig | null> {
  const clientId = (await getOptionalEnvValue("GOOGLE_CLIENT_ID"))?.trim();
  const clientSecret = (
    await getOptionalEnvValue("GOOGLE_CLIENT_SECRET")
  )?.trim();

  if (!clientId || !clientSecret) return null;

  return { clientId, clientSecret };
}

// Self-hosted Analytics needs the Google OAuth client AND BETTER_AUTH_SECRET
// (>=32 chars): the secret keys OAuth-token encryption and lets us build the
// Better Auth instance that mints/refreshes tokens. Both must be set before we
// surface the connect flow.
export async function hasSelfHostedGa4Config(): Promise<boolean> {
  if (!(await getGa4OAuthClientConfig())) return false;

  const secret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  return Boolean(secret && secret.length >= MIN_BETTER_AUTH_SECRET_LENGTH);
}
