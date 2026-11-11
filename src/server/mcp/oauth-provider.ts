import {
  AuthorizationError,
  OAuthError,
  OAuthProvider,
  authorizationErrorRedirect,
  type AuthRequest,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { z } from "zod";
import { getHostedBaseUrl } from "@/lib/auth";
import { OAUTH_AUTHORIZE_PATH } from "@/lib/auth-redirect";
import {
  getMcpResource,
  MCP_OAUTH_SCOPES,
  MCP_SCOPE,
} from "@/lib/oauth-resource";
import { asAppError } from "@/server/lib/errors";
import {
  buildAuthorizeRequestFromConsentQuery,
  completeMcpGrant,
  csrfProtected,
  getGrantedMcpScopes,
  getRelativeRequestTarget,
  jsonResponse,
  OAUTH_AUTHORIZATION_PARAM_NAMES,
  resolveContextForConsent,
} from "@/server/mcp/oauth-grant";
import { handleOAuthGuestRequest } from "@/server/mcp/oauth-guest";
import { checkGuestEligibility } from "@/server/auth/guest-accounts";
import {
  createWorkersOAuthMcpProps,
  MCP_AUTH_CONTEXT_PROP,
  MCP_ROUTE,
  workersOAuthMcpPropsSchema,
} from "@/server/mcp/context";
import { handleOAuthError } from "@/server/mcp/oauth-errors";
import { normalizeClientRegistrationRequest } from "@/server/mcp/oauth-registration";
import { resolveHostedContext } from "@/middleware/ensure-user/hosted";
import { handleMcpApiKeyRequest } from "@/server/mcp/api-key-auth";

const OAUTH_TOKEN_PATH = "/api/auth/oauth2/token";
const OAUTH_REGISTER_PATH = "/api/auth/oauth2/register";
const OAUTH_PURGE_CURSOR_KEY = "purge-cursor";

const OAUTH_CONSENT_RESPONSE_PATH = "/api/oauth/consent";
const OAUTH_GUEST_PATH = "/api/oauth/guest";
// Keep access tokens reasonably short-lived while allowing refresh tokens to
// preserve MCP sessions across normal usage.
const MCP_ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24;
const MCP_REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const MCP_CLIENT_REGISTRATION_TTL_SECONDS = 60 * 60 * 24 * 365;

export type OpenSeoOAuthEnv = Env & {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER?: OAuthHelpers;
};

type AppFetch = (request: Request) => Response | Promise<Response>;

type ExportedHandlerWithFetch<Env> = ExportedHandler<Env> & {
  fetch: NonNullable<ExportedHandler<Env>["fetch"]>;
};

const consentResponseSchema = z.object({
  accept: z.boolean(),
  query: z.string(),
});

function getOAuthHelpers(env: OpenSeoOAuthEnv) {
  if (!env.OAUTH_PROVIDER) {
    throw new Error("OAuth provider helpers are unavailable");
  }

  return env.OAUTH_PROVIDER;
}

function redirectToSignIn(request: Request) {
  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("redirect", getRelativeRequestTarget(request));
  return Response.redirect(signInUrl.toString(), 302);
}

// The /connect page runs Turnstile and posts back to OAUTH_GUEST_PATH with
// the same authorize params.
function redirectToGuestConnect(request: Request) {
  const connectUrl = new URL("/connect", request.url);
  connectUrl.search = new URL(request.url).search;
  return Response.redirect(connectUrl.toString(), 302);
}

function authorizationErrorResponse(error: AuthorizationError) {
  if (!error.redirectTo) {
    return new Response(error.description, { status: 400 });
  }

  return Response.redirect(error.redirectTo, 302);
}

async function getAuthorizeSessionBlocker(
  request: Request,
  redirectUri: string,
) {
  try {
    await resolveHostedContext(request.headers);
    return null;
  } catch (error) {
    const appError = asAppError(error);
    if (appError?.code === "UNAUTHENTICATED") {
      // No session: an eligible browser gets a guest account instead of the
      // sign-in page (src/server/auth/guest-accounts.ts). A failed check
      // (database, feature flag) must never block the normal sign-in.
      const guest = await checkGuestEligibility(request, redirectUri).catch(
        (checkError: unknown) => {
          console.error("mcp.guest eligibility check failed", checkError);
          return { eligible: false } as const;
        },
      );
      return guest.eligible
        ? redirectToGuestConnect(request)
        : redirectToSignIn(request);
    }

    if (appError?.code === "AUTH_CONFIG_MISSING") {
      return new Response("Missing Better Auth hosted configuration", {
        status: 500,
      });
    }

    throw error;
  }
}

function buildConsentUrl(request: Request) {
  const sourceUrl = new URL(request.url);
  const consentUrl = new URL("/oauth-consent", request.url);

  for (const key of OAUTH_AUTHORIZATION_PARAM_NAMES) {
    for (const value of sourceUrl.searchParams.getAll(key)) {
      consentUrl.searchParams.append(key, value);
    }
  }

  return consentUrl;
}

async function handleOAuthAuthorizeRequest(
  request: Request,
  env: OpenSeoOAuthEnv,
) {
  const oauth = getOAuthHelpers(env);

  let authRequest: AuthRequest;
  try {
    authRequest = await oauth.parseAuthRequest(request);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    throw error;
  }

  const sessionBlocker = await getAuthorizeSessionBlocker(
    request,
    authRequest.redirectUri,
  );
  if (sessionBlocker) return sessionBlocker;

  return Response.redirect(buildConsentUrl(request).toString(), 302);
}

async function handleOAuthConsentResponse(
  request: Request,
  env: OpenSeoOAuthEnv,
) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!csrfProtected(request)) {
    return jsonResponse({ error: "Invalid request origin" }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid consent response" }, { status: 400 });
  }

  const body = consentResponseSchema.safeParse(rawBody);
  if (!body.success) {
    return jsonResponse({ error: "Invalid consent response" }, { status: 400 });
  }

  const oauth = getOAuthHelpers(env);
  const authorizeRequest = buildAuthorizeRequestFromConsentQuery(
    request,
    body.data.query,
  );

  let authRequest: AuthRequest;
  try {
    authRequest = await oauth.parseAuthRequest(authorizeRequest);
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
    return jsonResponse(
      {
        error: error.description,
      },
      { status: 400 },
    );
  }

  if (!body.data.accept) {
    return jsonResponse({
      redirectTo: authorizationErrorRedirect(
        authRequest,
        "access_denied",
        "The user denied access",
      ),
    });
  }

  const context = await resolveContextForConsent(request);
  if (!context) {
    return jsonResponse({ error: "Sign in required" }, { status: 401 });
  }

  let scopes: string[];
  try {
    scopes = getGrantedMcpScopes(authRequest.scope);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Invalid OAuth scopes",
      },
      { status: 400 },
    );
  }

  const redirectTo = await completeMcpGrant({
    request,
    oauth,
    authRequest,
    scopes,
    context,
  });
  return jsonResponse({ redirectTo });
}

// The provider sets OAUTH_PROVIDER on the env it hands the default handler,
// but `import { env } from "cloudflare:workers"` is a different object, so
// server functions (which run inside appFetch) cannot read it there. The
// helpers are stateless wrappers over the OAUTH_KV binding, so one module-level
// reference serves every request.
let oauthHelpers: OAuthHelpers | undefined;

export function getCapturedOAuthHelpers() {
  if (!oauthHelpers) {
    throw new Error("OAuth provider helpers are unavailable");
  }
  return oauthHelpers;
}

// What the consent screen shows about the request it approves. Parsing checks
// the client and its redirect address the same way approving does, so the
// screen never names an address the approval would refuse.
export async function getConsentRequest(request: Request, query: string) {
  const oauth = getCapturedOAuthHelpers();
  const authRequest = await oauth.parseAuthRequest(
    buildAuthorizeRequestFromConsentQuery(request, query),
  );
  const client = await oauth.lookupClient(authRequest.clientId);
  return {
    // Self-reported, and optional when a client registers.
    clientName: client?.clientName,
    redirectUri: authRequest.redirectUri,
  };
}

function createDefaultHandler(
  appFetch: AppFetch,
): ExportedHandlerWithFetch<OpenSeoOAuthEnv> {
  return {
    async fetch(request, env) {
      oauthHelpers = env.OAUTH_PROVIDER;
      const url = new URL(request.url);

      if (url.pathname === OAUTH_AUTHORIZE_PATH) {
        return handleOAuthAuthorizeRequest(request, env);
      }

      if (url.pathname === OAUTH_GUEST_PATH) {
        return handleOAuthGuestRequest(request, getOAuthHelpers(env));
      }

      if (url.pathname === OAUTH_CONSENT_RESPONSE_PATH) {
        return handleOAuthConsentResponse(request, env);
      }

      return appFetch(request);
    },
  };
}

const mcpApiHandler: ExportedHandlerWithFetch<OpenSeoOAuthEnv> = {
  async fetch(request, env, ctx) {
    const { handleAuthenticatedOpenSeoMcpRequest } =
      await import("@/server/mcp/transport");
    return handleAuthenticatedOpenSeoMcpRequest(request, ctx.props, env, ctx);
  },
};

function createProvider(appFetch: AppFetch, resource: string) {
  return new OAuthProvider<OpenSeoOAuthEnv>({
    apiRoute: MCP_ROUTE,
    apiHandler: mcpApiHandler,
    defaultHandler: createDefaultHandler(appFetch),
    authorizeEndpoint: OAUTH_AUTHORIZE_PATH,
    tokenEndpoint: OAUTH_TOKEN_PATH,
    clientRegistrationEndpoint: OAUTH_REGISTER_PATH,
    scopesSupported: [...MCP_OAUTH_SCOPES],
    accessTokenTTL: MCP_ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTTL: MCP_REFRESH_TOKEN_TTL_SECONDS,
    refreshTokenIdleTTL: MCP_REFRESH_TOKEN_TTL_SECONDS,
    clientRegistrationTTL: MCP_CLIENT_REGISTRATION_TTL_SECONDS,
    allowPrivateUseRedirectUris: true,
    resourceMetadata: {
      resource,
      scopes_supported: [MCP_SCOPE],
      resource_name: "OpenSEO MCP",
    },
    tokenExchangeCallback: ({ props, requestedScope }) => {
      if (!requestedScope.includes(MCP_SCOPE)) {
        throw new OAuthError("invalid_scope", {
          description: "The mcp scope is required",
        });
      }

      const authContext =
        workersOAuthMcpPropsSchema.parse(props)[MCP_AUTH_CONTEXT_PROP];
      return {
        accessTokenProps: createWorkersOAuthMcpProps({
          ...authContext,
          scopes: requestedScope,
        }),
      };
    },
    onError: handleOAuthError,
  });
}

export function createOpenSeoOAuthProvider(appFetch: AppFetch) {
  // Built lazily because the canonical resource comes from BETTER_AUTH_URL,
  // which is not readable at module-init time. It is the same base URL the
  // consent handler stamps into grant props.
  let provider: OAuthProvider<OpenSeoOAuthEnv> | undefined;
  const getProvider = () =>
    (provider ??= createProvider(appFetch, getMcpResource(getHostedBaseUrl())));

  return {
    async fetch(request: Request, env: OpenSeoOAuthEnv, ctx: ExecutionContext) {
      const url = new URL(request.url);

      const apiKeyResponse = await handleMcpApiKeyRequest(request, env, ctx);
      if (apiKeyResponse) return apiKeyResponse;

      if (url.pathname === OAUTH_REGISTER_PATH) {
        return getProvider().fetch(
          await normalizeClientRegistrationRequest(request),
          env,
          ctx,
        );
      }

      return getProvider().fetch(request, env, ctx);
    },

    // Resume the bounded sweep across cron runs, including past live records.
    async purgeExpiredData(env: OpenSeoOAuthEnv) {
      const cursor =
        (await env.OAUTH_KV.get(OAUTH_PURGE_CURSOR_KEY)) ?? undefined;
      const result = await getProvider().purgeExpiredData(env, {
        batchSize: 200,
        cursor,
      });
      if (result.cursor) {
        await env.OAUTH_KV.put(OAUTH_PURGE_CURSOR_KEY, result.cursor);
      } else {
        await env.OAUTH_KV.delete(OAUTH_PURGE_CURSOR_KEY);
      }
      return result;
    },
  };
}
