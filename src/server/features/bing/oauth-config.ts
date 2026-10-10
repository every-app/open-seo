import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { MIN_BETTER_AUTH_SECRET_LENGTH } from "@/shared/selfhost-checks";

type BingOAuthClientConfig = {
  clientId: string;
  clientSecret: string;
};

export async function getBingOAuthClientConfig(): Promise<BingOAuthClientConfig | null> {
  const clientId = (await getOptionalEnvValue("BING_CLIENT_ID"))?.trim();
  const clientSecret = (
    await getOptionalEnvValue("BING_CLIENT_SECRET")
  )?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Bing Webmaster OAuth needs its own client (one registration per
 *  environment, since Bing holds a single exact-match redirect URI) plus the
 *  secret that encrypts stored tokens. Hosted deployments always have both. */
export async function hasBingOAuthConfig(
  config?: BingOAuthClientConfig | null,
): Promise<boolean> {
  const oauthConfig =
    config === undefined ? await getBingOAuthClientConfig() : config;
  if (!oauthConfig) return false;
  const secret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  return Boolean(secret && secret.length >= MIN_BETTER_AUTH_SECRET_LENGTH);
}
