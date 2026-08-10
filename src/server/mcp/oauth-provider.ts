import { waitUntil } from "cloudflare:workers";
import {
  AuthorizationError,
  OAuthError,
  OAuthProvider,
  type AuthRequest,
  type OAuthHelpers,
  type OAuthProviderOptions,
} from "@cloudflare/workers-oauth-provider";
import { z } from "zod";
import { getHostedBaseUrl } from "@/lib/auth";
import {
  getMcpResource,
  MCP_OAUTH_SCOPES,
  MCP_SCOPE,
} from "@/lib/oauth-resource";
import { asAppError } from "@/server/lib/errors";
import { recordMcpAuthorized } from "@/server/features/activation/mcpActivation";
import { captureServerEvent } from "@/server/lib/posthog";
import {
  createWorkersOAuthMcpProps,
  MCP_AUTH_CONTEXT_PROP,
  MCP_ROUTE,
  workersOAuthMcpPropsSchema,
} from "@/server/mcp/context";
import { normalizeClientRegistrationRequest } from "@/server/mcp/oauth-registration";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { handleAuthenticatedOpenSeoMcpRequest } from "@/server/mcp/transport";
import { resolveHostedContext } from "@/middleware/ensure-user/hosted";

const OAUTH_AUTHORIZE_PATH = "/api/auth/oauth2/authorize";
const OAUTH_TOKEN_PATH = "/api/auth/oauth2/token";
const OAUTH_REGISTER_PATH = "/api/auth/oauth2/register";

const OAUTH_CONSENT_RESPONSE_PATH = "/api/oauth/consent";
const OAUTH_AUTHORIZATION_PARAM_NAMES = [
  "response_type",
  "client_id",
  "redirect_uri",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
  "resource",
] as const;
// Keep access tokens reasonably short-lived while allowing refresh tokens to
// preserve MCP sessions across normal usage.
const MCP_ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24;
const MCP_REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
// DCR client records expire on a fixed clock from registration (the provider
// defaults to 90 days), and an actively refreshing client breaks with
// invalid_client the moment its record lapses. A year keeps that cliff rare;
// rolling 30-day refresh tokens already reap inactive clients' sessions.
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

function getRelativeRequestTarget(request: Request) {
  const url = new URL(request.url);
  return `${url.pathname}${url.search}`;
}

function redirectToSignIn(request: Request) {
  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("redirect", getRelativeRequestTarget(request));
  return Response.redirect(signInUrl.toString(), 302);
}

function oauthErrorRedirect(input: {
  redirectUri: string;
  code: string;
  description: string;
  state?: string;
  issuer?: string;
}) {
  const redirectUrl = new URL(input.redirectUri);
  redirectUrl.searchParams.set("error", input.code);
  redirectUrl.searchParams.set("error_description", input.description);
  if (input.state) redirectUrl.searchParams.set("state", input.state);
  if (input.issuer) redirectUrl.searchParams.set("iss", input.issuer);
  return redirectUrl.toString();
}

function authorizationErrorResponse(error: AuthorizationError) {
  if (!error.redirectUri) {
    return new Response(error.description, { status: 400 });
  }

  return Response.redirect(
    oauthErrorRedirect({
      redirectUri: error.redirectUri,
      code: error.code,
      description: error.description,
      state: error.state,
      issuer: error.issuer,
    }),
    302,
  );
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

function logOAuthError(error: {
  code: string;
  description: string;
  status: number;
}) {
  // 401s here are the standard OAuth discovery handshake, not failures: an
  // unauthenticated /mcp hit returns `invalid_token` (which triggers the
  // client's .well-known discovery), and stale client registrations draw
  // `invalid_client` until the client re-registers. Log those at debug so
  // they stop masquerading as errors; keep 5xx at error and everything else
  // (bad client metadata, etc.) at warn.
  const line = `[oauth] ${error.status} ${error.code}: ${error.description}`;
  if (error.status === 401) {
    console.debug(line);
  } else if (error.status >= 500) {
    console.error(line);
  } else {
    console.warn(line);
  }

  // Returning void delegates the standards-compliant body, bearer challenge,
  // and CORS headers to workers-oauth-provider.
}

function csrfProtected(request: Request) {
  const origin = request.headers.get("Origin");
  return origin === getPublicOrigin(request);
}

async function getAuthorizeSessionBlocker(request: Request) {
  try {
    await resolveHostedContext(request.headers);
    return null;
  } catch (error) {
    const appError = asAppError(error);
    if (appError?.code === "UNAUTHENTICATED") {
      return redirectToSignIn(request);
    }

    if (appError?.code === "AUTH_CONFIG_MISSING") {
      return new Response("Missing Better Auth hosted configuration", {
        status: 500,
      });
    }

    throw error;
  }
}

async function resolveContextForConsent(request: Request) {
  try {
    return await resolveHostedContext(request.headers);
  } catch (error) {
    const appError = asAppError(error);
    if (appError?.code === "UNAUTHENTICATED") {
      return null;
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

function buildAuthorizeRequestFromConsentQuery(
  request: Request,
  query: string,
) {
  const authorizeUrl = new URL(OAUTH_AUTHORIZE_PATH, request.url);
  const params = new URLSearchParams(query);

  for (const key of OAUTH_AUTHORIZATION_PARAM_NAMES) {
    for (const value of params.getAll(key)) {
      authorizeUrl.searchParams.append(key, value);
    }
  }

  return new Request(authorizeUrl.toString(), {
    headers: request.headers,
  });
}

function getGrantedMcpScopes(requestedScopes: string[]) {
  if (requestedScopes.length === 0) {
    return [...MCP_OAUTH_SCOPES];
  }

  const requested = new Set(requestedScopes);
  const granted = MCP_OAUTH_SCOPES.filter((scope) => requested.has(scope));

  if (!granted.includes(MCP_SCOPE)) {
    throw new Error("The mcp scope is required");
  }

  return granted;
}

function deniedRedirect(authRequest: AuthRequest) {
  return oauthErrorRedirect({
    redirectUri: authRequest.redirectUri,
    code: "access_denied",
    description: "The user denied access",
    state: authRequest.state,
    issuer: authRequest.issuer,
  });
}

async function handleOAuthAuthorizeRequest(
  request: Request,
  env: OpenSeoOAuthEnv,
) {
  const oauth = getOAuthHelpers(env);

  try {
    await oauth.parseAuthRequest(request);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return authorizationErrorResponse(error);
    }
    throw error;
  }

  const sessionBlocker = await getAuthorizeSessionBlocker(request);
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
    return jsonResponse({ redirectTo: deniedRedirect(authRequest) });
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

  const props = createWorkersOAuthMcpProps({
    userId: context.userId,
    userEmail: context.userEmail,
    organizationId: context.organizationId,
    baseUrl: getHostedBaseUrl(),
    clientId: authRequest.clientId,
    scopes,
  });

  const { redirectTo } = await oauth.completeAuthorization({
    request: authRequest,
    userId: context.userId,
    metadata: {
      clientId: authRequest.clientId,
      organizationId: context.organizationId,
    },
    scope: scopes,
    props,
  });

  await recordMcpAuthorized(context.organizationId);

  waitUntil(
    captureServerEvent({
      distinctId: context.userId,
      event: "mcp:authorize_success",
      organizationId: context.organizationId,
      properties: {
        client_id: authRequest.clientId,
        scopes: scopes.join(" "),
      },
    }),
  );

  return jsonResponse({ redirectTo });
}

function createDefaultHandler(
  appFetch: AppFetch,
): ExportedHandlerWithFetch<OpenSeoOAuthEnv> {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);

      if (url.pathname === OAUTH_AUTHORIZE_PATH) {
        return handleOAuthAuthorizeRequest(request, env);
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
    return handleAuthenticatedOpenSeoMcpRequest(request, ctx.props, env, ctx);
  },
};

function createProvider(appFetch: AppFetch, resource: string) {
  const options: OAuthProviderOptions<OpenSeoOAuthEnv> = {
    apiRoute: MCP_ROUTE,
    apiHandler: mcpApiHandler,
    defaultHandler: createDefaultHandler(appFetch),
    authorizeEndpoint: OAUTH_AUTHORIZE_PATH,
    tokenEndpoint: OAUTH_TOKEN_PATH,
    clientRegistrationEndpoint: OAUTH_REGISTER_PATH,
    scopesSupported: [...MCP_OAUTH_SCOPES],
    accessTokenTTL: MCP_ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTTL: MCP_REFRESH_TOKEN_TTL_SECONDS,
    clientRegistrationTTL: MCP_CLIENT_REGISTRATION_TTL_SECONDS,
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
    onError: logOAuthError,
  };

  return new OAuthProvider(options);
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

      if (url.pathname === OAUTH_REGISTER_PATH) {
        return getProvider().fetch(
          await normalizeClientRegistrationRequest(request),
          env,
          ctx,
        );
      }

      return getProvider().fetch(request, env, ctx);
    },

    // Cron GC for OAUTH_KV: sweeps orphaned grants/tokens (e.g. from expired
    // client registrations) that KV TTLs alone don't reclaim. The sweep only
    // advances past live records by deleting dead ones, so give it a batch
    // large enough to cover the whole keyspace in one pass while staying
    // within the invocation's subrequest budget.
    purgeExpiredData(env: OpenSeoOAuthEnv) {
      return getProvider().purgeExpiredData(env, { batchSize: 200 });
    },
  };
}
