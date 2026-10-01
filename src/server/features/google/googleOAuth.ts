import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { account } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { resolveUserContextFromHeaders } from "@/middleware/ensure-user/resolve";
import { AppError } from "@/server/lib/errors";
import { responseForAppError } from "@/server/lib/http-errors";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { GA4_OAUTH_PROVIDER_ID, GA4_OAUTH_SCOPES } from "@/shared/ga4";
import {
  GOOGLE_LINK_ERROR_PARAM,
  type GoogleLinkProvider,
} from "@/shared/google-link";
import { GSC_OAUTH_PROVIDER_ID, GSC_OAUTH_SCOPES } from "@/shared/gsc";
import { appPath } from "@/shared/app-path";
import {
  getGoogleOAuthClientConfig,
  hasGoogleOAuthConfig,
} from "./oauth-config";
import { getGoogleAccountId } from "./googleIdToken";
import {
  consumeState,
  createState,
  getCodeChallenge,
  getCodeVerifier,
} from "./googleOAuthState";

/**
 * Google data grants (Search Console, Analytics) are linked here rather than
 * through Better Auth's generic-oauth plugin. Better Auth treats every linked
 * provider account as a login identity and refuses to link one Google account
 * to a second user, which blocked agencies and multi-member orgs from each
 * connecting the same client Google account. Grants live in the Better Auth
 * `account` table, encrypted with its secret, but are keyed per user so the
 * same Google identity may back several users. This module owns the whole
 * lifecycle: consent redirect, callback, and access-token refresh. The state
 * is a single-use nonce bound to the session user and provider, stored in
 * Better Auth's verification table and deleted by the first callback that
 * presents it. The PKCE verifier is an HMAC of that nonce.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
// Refresh when the stored access token is within this many ms of expiry.
const ACCESS_TOKEN_SKEW_MS = 5_000;

export type GoogleOAuthIntegration = {
  provider: GoogleLinkProvider;
  providerId: string;
  displayName: string;
  callbackPath: string;
  scopes: readonly string[];
};

export const GSC_INTEGRATION: GoogleOAuthIntegration = {
  provider: "gsc",
  providerId: GSC_OAUTH_PROVIDER_ID,
  displayName: "Search Console",
  callbackPath: appPath("/api/gsc/oauth/callback"),
  scopes: GSC_OAUTH_SCOPES,
};

export const GA4_INTEGRATION: GoogleOAuthIntegration = {
  provider: "ga4",
  providerId: GA4_OAUTH_PROVIDER_ID,
  displayName: "Google Analytics",
  callbackPath: appPath("/api/ga4/oauth/callback"),
  scopes: GA4_OAUTH_SCOPES,
};

const googleTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
});

type GoogleTokenResponse = z.infer<typeof googleTokenResponseSchema>;

/** Same-origin path to return to after consent. A pathname can start with
 *  `//host`, which browsers treat as protocol-relative, so the reduced path is
 *  re-parsed to prove it still resolves to our origin. */
function getSafeCallbackPath(callbackURL: string, publicOrigin: string) {
  try {
    const url = new URL(callbackURL, publicOrigin);
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (url.origin !== publicOrigin) return "/";
    if (new URL(path, publicOrigin).origin !== publicOrigin) return "/";
    return path;
  } catch {
    return "/";
  }
}

function getRedirectUri(
  publicOrigin: string,
  integration: GoogleOAuthIntegration,
) {
  return `${publicOrigin}${integration.callbackPath}`;
}

/** Token encryption matches Better Auth's own `account` rows so grants
 *  written before this module (and google social-login rows) stay readable. */
async function tokenCrypto() {
  const ctx = await getAuth().$context;
  const enabled = Boolean(ctx.options.account?.encryptOAuthTokens);
  return {
    encrypt: (value: string) =>
      enabled
        ? symmetricEncrypt({ key: ctx.secretConfig, data: value })
        : value,
    decrypt: (value: string) =>
      enabled
        ? symmetricDecrypt({ key: ctx.secretConfig, data: value })
        : value,
  };
}

async function upsertGrant(input: {
  integration: GoogleOAuthIntegration;
  userId: string;
  googleAccountId: string;
  tokens: GoogleTokenResponse;
}) {
  const { encrypt } = await tokenCrypto();
  const accountValues = {
    accountId: input.googleAccountId,
    providerId: input.integration.providerId,
    userId: input.userId,
    accessToken: await encrypt(input.tokens.access_token),
    refreshToken: input.tokens.refresh_token
      ? await encrypt(input.tokens.refresh_token)
      : null,
    accessTokenExpiresAt: new Date(
      Date.now() + (input.tokens.expires_in ?? 3600) * 1_000,
    ),
    refreshTokenExpiresAt: null,
    scope: input.tokens.scope
      ? input.tokens.scope.trim().split(/\s+/).join(",")
      : input.integration.scopes.join(","),
    password: null,
  };
  await db
    .insert(account)
    .values({
      id: crypto.randomUUID(),
      ...accountValues,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [account.userId, account.providerId, account.accountId],
      targetWhere: sql`${account.providerId} in ('google-search-console', 'google-analytics')`,
      set: {
        ...accountValues,
        // Google may omit the refresh token on a later consent. Keep the
        // stored token, including when two callbacks finish together.
        refreshToken: sql`coalesce(excluded.refresh_token, ${account.refreshToken})`,
        updatedAt: new Date(),
      },
    });
}

/** Google's token endpoint; null when it rejects the grant. */
async function fetchTokens(params: Record<string, string>) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!response.ok) return null;
  return googleTokenResponseSchema.parse(await response.json());
}

export async function createGoogleAuthorizationUrl(input: {
  integration: GoogleOAuthIntegration;
  userId: string;
  callbackURL: string;
  publicOrigin: string;
}) {
  const config = await getGoogleOAuthClientConfig();
  if (!config || !(await hasGoogleOAuthConfig(config))) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      `${input.integration.displayName} is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and BETTER_AUTH_SECRET.`,
    );
  }
  const state = await createState({
    provider: input.integration.provider,
    userId: input.userId,
    callbackPath: getSafeCallbackPath(input.callbackURL, input.publicOrigin),
  });
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set(
    "redirect_uri",
    getRedirectUri(input.publicOrigin, input.integration),
  );
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.integration.scopes.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "select_account consent");
  url.searchParams.set("state", state);
  url.searchParams.set(
    "code_challenge",
    await getCodeChallenge(
      await getCodeVerifier({
        state,
        clientSecret: config.clientSecret,
        provider: input.integration.provider,
      }),
    ),
  );
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

function redirect(location: string) {
  return new Response(null, { status: 303, headers: { Location: location } });
}

/**
 * Google returns here after consent. Failures the user can act on go back to
 * the page that started the connect with `error` + the provider marker, which
 * GoogleLinkErrorAlert renders next to the Connect button. An unverifiable
 * state has no page to return to, so it lands on /auth-error.
 */
async function handleGoogleOAuthCallback(input: {
  integration: GoogleOAuthIntegration;
  request: Request;
  userId: string;
  publicOrigin: string;
}) {
  const config = await getGoogleOAuthClientConfig();
  if (!config) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      `${input.integration.displayName} OAuth is not configured.`,
    );
  }
  const url = new URL(input.request.url);
  const rawState = url.searchParams.get("state");
  // Consumed before the user check so a state presented by the wrong session
  // is burned rather than left for a second attempt.
  const state = await consumeState({
    state: rawState,
    provider: input.integration.provider,
  });
  if (!rawState || !state || state.userId !== input.userId) {
    return redirect("/auth-error?error=state_mismatch");
  }
  const fail = (code: string) => {
    const back = new URL(state.callbackPath, input.publicOrigin);
    back.searchParams.set(GOOGLE_LINK_ERROR_PARAM, input.integration.provider);
    back.searchParams.set("error", code);
    return redirect(`${back.pathname}${back.search}${back.hash}`);
  };
  const googleError = url.searchParams.get("error");
  if (googleError) return fail(googleError);
  const code = url.searchParams.get("code");
  if (!code) return fail("missing_code");
  let tokens: GoogleTokenResponse | null;
  try {
    tokens = await fetchTokens({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: getRedirectUri(input.publicOrigin, input.integration),
      grant_type: "authorization_code",
      code_verifier: await getCodeVerifier({
        state: rawState,
        clientSecret: config.clientSecret,
        provider: input.integration.provider,
      }),
    });
  } catch {
    return fail("oauth_code_verification_failed");
  }
  if (!tokens) return fail("oauth_code_verification_failed");
  let googleAccountId: string;
  try {
    googleAccountId = await getGoogleAccountId(
      tokens.id_token ?? "",
      config.clientId,
    );
  } catch {
    return fail("oauth_code_verification_failed");
  }
  try {
    await upsertGrant({
      integration: input.integration,
      userId: input.userId,
      googleAccountId,
      tokens,
    });
  } catch (error) {
    console.error("google.oauth.grant_save_failed", {
      provider: input.integration.provider,
      error,
    });
    return fail("connection_save_failed");
  }
  return redirect(state.callbackPath);
}

/**
 * A currently valid access token for one of the user's Google grants,
 * refreshed against Google and re-persisted when it is about to expire.
 * `accountId` (the Google sub) picks between several grants for the same
 * provider; legacy connections without one fall back to the first grant.
 */
export async function getGoogleAccessToken(input: {
  userId: string;
  providerId: string;
  accountId?: string;
}): Promise<string> {
  const [grant] = await db
    .select({
      id: account.id,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      accessTokenExpiresAt: account.accessTokenExpiresAt,
    })
    .from(account)
    .where(
      and(
        eq(account.userId, input.userId),
        eq(account.providerId, input.providerId),
        input.accountId ? eq(account.accountId, input.accountId) : undefined,
      ),
    )
    .limit(1);
  if (!grant) throw new Error(`No ${input.providerId} grant for this user.`);
  const { encrypt, decrypt } = await tokenCrypto();
  const expiresAt = grant.accessTokenExpiresAt?.getTime();
  const fresh =
    expiresAt !== undefined && expiresAt - Date.now() > ACCESS_TOKEN_SKEW_MS;
  if (fresh && grant.accessToken) return decrypt(grant.accessToken);
  if (!grant.refreshToken) {
    // Google only issues a refresh token on the first consent, so a grant
    // without one cannot recover once its access token expires. Failing here
    // lets the GSC/GA4 clients ask for a reconnect instead of sending a dead
    // token to Google.
    throw new Error(
      `The ${input.providerId} grant has expired and cannot be refreshed.`,
    );
  }
  const config = await getGoogleOAuthClientConfig();
  if (!config) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      "Google OAuth is not configured.",
    );
  }
  const tokens = await fetchTokens({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: await decrypt(grant.refreshToken),
    grant_type: "refresh_token",
  });
  if (!tokens) {
    throw new Error(`Google refused to refresh the ${input.providerId} grant.`);
  }
  await db
    .update(account)
    .set({
      accessToken: await encrypt(tokens.access_token),
      accessTokenExpiresAt: new Date(
        Date.now() + (tokens.expires_in ?? 3600) * 1_000,
      ),
      // Google rarely rotates refresh tokens; keep a new one when it does.
      ...(tokens.refresh_token
        ? { refreshToken: await encrypt(tokens.refresh_token) }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(account.id, grant.id));
  return tokens.access_token;
}

export async function handleGoogleOAuthCallbackRequest(
  request: Request,
  integration: GoogleOAuthIntegration,
) {
  try {
    const context = await resolveUserContextFromHeaders(request.headers);
    return await handleGoogleOAuthCallback({
      integration,
      request,
      userId: context.userId,
      publicOrigin: getPublicOrigin(request),
    });
  } catch (error) {
    // The browser is mid-redirect from Google, so an expired session or a
    // missing config should land on the error page, not a bare status body.
    if (error instanceof AppError) {
      return redirect(`/auth-error?error=${error.code.toLowerCase()}`);
    }
    return responseForAppError(
      error,
      `${integration.displayName} OAuth failed`,
    );
  }
}
