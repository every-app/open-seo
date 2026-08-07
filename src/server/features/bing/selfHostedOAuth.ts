import { symmetricEncrypt } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { decodeJwt } from "jose";
import { z } from "zod";
import { db } from "@/db";
import { account } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { AppError } from "@/server/lib/errors";
import { BING_OAUTH_PROVIDER_ID, BING_OAUTH_SCOPES } from "@/shared/bing";
import {
  getBingOAuthClientConfig,
  hasSelfHostedBingConfig,
} from "./oauth-config";

const MICROSOFT_AUTH_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MICROSOFT_TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";

type SelfHostedBingUser = {
  userId: string;
  userEmail: string;
};

const oauthStateSchema = z.object({
  userId: z.string().min(1),
  callbackPath: z.string().min(1),
  exp: z.number().int(),
});

const bingTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
  token_type: z.string().optional(),
});

type BingTokenResponse = z.infer<typeof bingTokenResponseSchema>;

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlToBytes(value: string) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function getStateKey(clientSecret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`openseo:bing:${clientSecret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signState(payload: string, clientSecret: string) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await getStateKey(clientSecret),
    new TextEncoder().encode(payload),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

function getSafeCallbackPath(callbackURL: string, publicOrigin: string) {
  try {
    const url = new URL(callbackURL, publicOrigin);
    if (url.origin !== publicOrigin) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

async function createState(input: {
  clientSecret: string;
  userId: string;
  callbackURL: string;
  publicOrigin: string;
}) {
  const payload = bytesToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        userId: input.userId,
        callbackPath: getSafeCallbackPath(
          input.callbackURL,
          input.publicOrigin,
        ),
        exp: Date.now() + 10 * 60 * 1_000,
      }),
    ),
  );
  const signature = await signState(payload, input.clientSecret);
  return `${payload}.${signature}`;
}

async function verifyState(state: string, clientSecret: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) {
    throw new AppError("VALIDATION_ERROR", "Invalid Bing Webmaster state");
  }

  const ok = await crypto.subtle.verify(
    "HMAC",
    await getStateKey(clientSecret),
    base64UrlToBytes(signature),
    new TextEncoder().encode(payload),
  );
  if (!ok) {
    throw new AppError("VALIDATION_ERROR", "Invalid Bing Webmaster state");
  }

  const parsed = oauthStateSchema.parse(
    JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))),
  );
  if (parsed.exp < Date.now()) {
    throw new AppError("VALIDATION_ERROR", "Expired Bing Webmaster state");
  }

  return parsed;
}

function getRedirectUri(publicOrigin: string) {
  return `${publicOrigin}/api/bing/oauth/callback`;
}

function accessTokenExpiresAt(tokens: BingTokenResponse) {
  return new Date(Date.now() + (tokens.expires_in ?? 3600) * 1_000);
}

function storedScope(tokens: BingTokenResponse) {
  return tokens.scope
    ? tokens.scope.trim().split(/\s+/).join(",")
    : BING_OAUTH_SCOPES.join(",");
}

function getClaimedAccountId(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const claims = decodeJwt(token);
    for (const key of ["oid", "sub", "uid"] as const) {
      const value = claims[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
  } catch {
    // The access token may be opaque. The user id fallback below still gives
    // Better Auth a stable account selector for this self-hosted grant.
  }
  return null;
}

function getBingAccountId(tokens: BingTokenResponse, userId: string) {
  return (
    getClaimedAccountId(tokens.id_token) ??
    getClaimedAccountId(tokens.access_token) ??
    userId
  );
}

async function upsertGrant(input: {
  user: SelfHostedBingUser;
  tokens: BingTokenResponse;
}) {
  // Keep token encryption in lockstep with Better Auth's OAuth write path so
  // getAccessToken can decrypt and refresh this grant later.
  const ctx = await getAuth().$context;
  const encrypt = (value: string) =>
    ctx.options.account?.encryptOAuthTokens
      ? symmetricEncrypt({ key: ctx.secretConfig, data: value })
      : value;
  const bingAccountId = getBingAccountId(input.tokens, input.user.userId);

  const existing = await db
    .select({ id: account.id, refreshToken: account.refreshToken })
    .from(account)
    .where(
      and(
        eq(account.userId, input.user.userId),
        eq(account.providerId, BING_OAUTH_PROVIDER_ID),
        eq(account.accountId, bingAccountId),
      ),
    )
    .limit(1);

  const accountValues = {
    accountId: bingAccountId,
    providerId: BING_OAUTH_PROVIDER_ID,
    userId: input.user.userId,
    accessToken: await encrypt(input.tokens.access_token),
    refreshToken: input.tokens.refresh_token
      ? await encrypt(input.tokens.refresh_token)
      : (existing[0]?.refreshToken ?? null),
    idToken: input.tokens.id_token
      ? await encrypt(input.tokens.id_token)
      : null,
    accessTokenExpiresAt: accessTokenExpiresAt(input.tokens),
    refreshTokenExpiresAt: null,
    scope: storedScope(input.tokens),
    password: null,
  };

  if (existing[0]) {
    await db
      .update(account)
      .set({ ...accountValues, updatedAt: new Date() })
      .where(eq(account.id, existing[0].id));
    return;
  }

  await db.insert(account).values({
    id: crypto.randomUUID(),
    ...accountValues,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

async function exchangeCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const response = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Microsoft rejected the Bing Webmaster authorization code.",
    );
  }

  return bingTokenResponseSchema.parse(await response.json());
}

export async function createSelfHostedBingAuthorizationUrl(input: {
  user: SelfHostedBingUser;
  callbackURL: string;
  publicOrigin: string;
}) {
  const config = await getBingOAuthClientConfig();
  if (!config || !(await hasSelfHostedBingConfig())) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      "Bing Webmaster OAuth is not configured. Set BING_CLIENT_ID, BING_CLIENT_SECRET, and BETTER_AUTH_SECRET, or use BING_WEBMASTER_API_KEY for the self-hosted API-key fallback.",
    );
  }

  const redirectUri = getRedirectUri(input.publicOrigin);
  const state = await createState({
    clientSecret: config.clientSecret,
    userId: input.user.userId,
    callbackURL: input.callbackURL,
    publicOrigin: input.publicOrigin,
  });
  const url = new URL(MICROSOFT_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", BING_OAUTH_SCOPES.join(" "));
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("state", state);

  return url.toString();
}

export async function handleSelfHostedBingOAuthCallback(input: {
  request: Request;
  user: SelfHostedBingUser;
  publicOrigin: string;
}) {
  const config = await getBingOAuthClientConfig();
  if (!config) {
    return new Response("Missing Bing Webmaster OAuth configuration", {
      status: 500,
    });
  }

  const url = new URL(input.request.url);
  const stateParam = url.searchParams.get("state");
  if (!stateParam) {
    return new Response("Missing Bing Webmaster OAuth state", { status: 400 });
  }

  const state = await verifyState(stateParam, config.clientSecret);
  if (state.userId !== input.user.userId) {
    return new Response("Bing Webmaster OAuth user mismatch", { status: 403 });
  }

  // state.callbackPath is a validated same-origin relative path. A relative
  // Location avoids trusting x-forwarded-host for the final redirect.
  const redirectToCallback = () =>
    new Response(null, {
      status: 303,
      headers: { Location: state.callbackPath },
    });

  if (url.searchParams.get("error")) return redirectToCallback();

  const code = url.searchParams.get("code");
  if (!code) {
    return new Response("Missing Bing Webmaster OAuth code", { status: 400 });
  }

  const tokens = await exchangeCode({
    code,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: getRedirectUri(input.publicOrigin),
  });
  await upsertGrant({ user: input.user, tokens });

  return redirectToCallback();
}
