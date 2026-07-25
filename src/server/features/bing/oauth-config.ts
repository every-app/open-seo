import { env } from "cloudflare:workers";
import type { GenericOAuthConfig } from "better-auth/plugins";
import { getEnvValueSync, getOptionalEnvValue } from "@/server/lib/runtime-env";
import {
  BING_AUTHORIZE_URL,
  BING_OAUTH_PROVIDER_ID,
  BING_OAUTH_SCOPES,
  BING_TOKEN_URL,
  decodeBingAccessToken,
} from "@/shared/bing";

type BingOAuthClientConfig = {
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

// Self-hosted Bing Webmaster needs the Bing OAuth client AND BETTER_AUTH_SECRET
// (>=32 chars): the secret keys OAuth-token/API-key encryption and lets us
// build the Better Auth instance that mints/refreshes tokens. Both must be set
// before we surface the connect flow.
export async function hasSelfHostedBingConfig(): Promise<boolean> {
  if (!(await getBingOAuthClientConfig())) return false;

  const secret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  return Boolean(secret && secret.length >= 32);
}

type BingGetUserInfo = NonNullable<GenericOAuthConfig["getUserInfo"]>;
type BingOAuthTokens = Parameters<BingGetUserInfo>[0];
type BingOAuthUserInfo = NonNullable<Awaited<ReturnType<BingGetUserInfo>>>;

/**
 * Bing publishes no userinfo endpoint and issues no id_token, so identity
 * comes from decoding the access token itself (base64url JSON carrying
 * `webmasteruid`/`webmasteremail`, verified live 2026-07-25). This makes ZERO
 * network calls — deliberately. Better Auth's genericOAuth rejects the
 * sign-in unless this returns a non-empty `id`, and treats `null` as failure.
 */
async function getBingUserInfo(
  tokens: BingOAuthTokens,
): Promise<BingOAuthUserInfo | null> {
  const claims = decodeBingAccessToken(tokens.accessToken ?? "");
  if (!claims) return null;

  return {
    id: claims.webmasteruid,
    email: claims.webmasteremail ?? null,
    emailVerified: false,
    // Bing has no display name, so `name` mirrors the email and is simply
    // absent when Bing omits that claim.
    name: claims.webmasteremail ?? undefined,
  };
}

/**
 * Registered by src/lib/auth-config.ts in the genericOAuth `config` array.
 * Bing publishes no OIDC discovery document, so the authorization/token URLs
 * are explicit rather than resolved via `discoveryUrl`, and `getUserInfo`
 * decodes the access token instead of hitting a userinfo endpoint.
 */
export const bingProviderConfig: GenericOAuthConfig = {
  providerId: BING_OAUTH_PROVIDER_ID,
  // Same env policy as runtime-env's async path: process.env first (dev
  // .env.local), then the Workers env binding.
  clientId: getEnvValueSync(env, "BING_CLIENT_ID")?.trim() ?? "",
  clientSecret: getEnvValueSync(env, "BING_CLIENT_SECRET")?.trim() ?? "",
  authorizationUrl: BING_AUTHORIZE_URL,
  tokenUrl: BING_TOKEN_URL,
  scopes: [...BING_OAUTH_SCOPES],
  pkce: true,
  getUserInfo: getBingUserInfo,
};
