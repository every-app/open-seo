import {
  getGoogleAccessMode,
  isGatewayGoogleAvailable,
} from "@/server/features/google/googleAccess";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { MIN_BETTER_AUTH_SECRET_LENGTH } from "@/shared/selfhost-checks";

type GoogleOAuthClientConfig = {
  clientId: string;
  clientSecret: string;
};

// Behind an Every App gateway OpenSEO has no Google client of its own, even
// if GOOGLE_CLIENT_ID happens to be set: the gateway holds Google
// (googleAccess.ts).
export async function getGoogleOAuthClientConfig(): Promise<GoogleOAuthClientConfig | null> {
  if ((await getGoogleAccessMode()) === "gateway") return null;
  const clientId = (await getOptionalEnvValue("GOOGLE_CLIENT_ID"))?.trim();
  const clientSecret = (
    await getOptionalEnvValue("GOOGLE_CLIENT_SECRET")
  )?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/** Search Console and Analytics need a Google OAuth client plus the secret
 *  that encrypts stored tokens. Hosted deployments always have both. */
export async function hasGoogleOAuthConfig(
  config?: GoogleOAuthClientConfig | null,
): Promise<boolean> {
  if ((await getGoogleAccessMode()) === "gateway") {
    return isGatewayGoogleAvailable();
  }
  const oauthConfig =
    config === undefined ? await getGoogleOAuthClientConfig() : config;
  if (!oauthConfig) return false;
  const secret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  return Boolean(secret && secret.length >= MIN_BETTER_AUTH_SECRET_LENGTH);
}
