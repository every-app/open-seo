import {
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
import {
  createWorkersOAuthMcpProps,
  MCP_ROUTE,
  withWorkersOAuthMcpScopes,
} from "@/server/mcp/context";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { handleAuthenticatedOpenSeoMcpRequest } from "@/server/mcp/transport";
import { resolveHostedContext } from "@/middleware/ensure-user/hosted";

const OAUTH_AUTHORIZE_PATH = "/api/auth/oauth2/authorize";
const OAUTH_TOKEN_PATH = "/api/auth/oauth2/token";
const OAUTH_REGISTER_PATH = "/api/auth/oauth2/register";

const OAUTH_CONSENT_RESPONSE_PATH = "/api/oauth/consent";
const WWW_AUTHENTICATE_HEADER = "WWW-Authenticate";
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
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export type OpenSeoOAuthEnv = Env & {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER?: OAuthHelpers;
};

type AppFetch = (request: Request) => Response | Promise<Response>;

type OAuthExecutionContext = ExecutionContext & {
  props?: unknown;
};

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

function getMcpResourceForRequest(request: Request) {
  return getMcpResource(getPublicOrigin(request));
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

function invalidOAuthRequestResponse(error: unknown) {
  return new Response(
    error instanceof Error ? error.message : "Invalid OAuth request",
    { status: 400 },
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

function oauthErrorResponse(error: {
  code: string;
  description: string;
  status: number;
  headers: Record<string, string>;
}) {
  console.warn(`[oauth] ${error.status} ${error.code}: ${error.description}`);

  const headers = new Headers(error.headers);
  headers.set("Content-Type", "application/json");
  if (headers.has(WWW_AUTHENTICATE_HEADER)) {
    headers.set("Access-Control-Expose-Headers", WWW_AUTHENTICATE_HEADER);
  }

  return new Response(
    JSON.stringify({
      error: error.code,
      error_description: error.description,
    }),
    {
      status: error.status,
      headers,
    },
  );
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

function withDefaultMcpResource(authRequest: AuthRequest, request: Request) {
  const mcpResource = getMcpResourceForRequest(request);
  if (!authRequest.resource) {
    return {
      ...authRequest,
      resource: mcpResource,
    };
  }

  const requestedResources = Array.isArray(authRequest.resource)
    ? authRequest.resource
    : [authRequest.resource];

  if (requestedResources.some((resource) => resource !== mcpResource)) {
    throw new Error(`OAuth resource must be ${mcpResource}`);
  }

  return {
    ...authRequest,
    resource: mcpResource,
  };
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
  const redirectUrl = new URL(authRequest.redirectUri);
  redirectUrl.searchParams.set("error", "access_denied");
  redirectUrl.searchParams.set("error_description", "The user denied access");
  if (authRequest.state) {
    redirectUrl.searchParams.set("state", authRequest.state);
  }

  return redirectUrl.toString();
}

async function handleOAuthAuthorizeRequest(
  request: Request,
  env: OpenSeoOAuthEnv,
) {
  const oauth = getOAuthHelpers(env);

  try {
    await oauth.parseAuthRequest(request);
  } catch (error) {
    return invalidOAuthRequestResponse(error);
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
    authRequest = withDefaultMcpResource(authRequest, request);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Invalid OAuth request",
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

  const audience = getMcpResourceForRequest(request);
  const props = createWorkersOAuthMcpProps({
    userId: context.userId,
    userEmail: context.userEmail,
    organizationId: context.organizationId,
    clientId: authRequest.clientId,
    scopes,
    audience,
    subject: context.userId,
    baseUrl: getHostedBaseUrl(),
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
    return handleAuthenticatedOpenSeoMcpRequest(
      request,
      (ctx as OAuthExecutionContext).props,
      env,
      ctx,
    );
  },
};

export function createOpenSeoOAuthProvider(appFetch: AppFetch) {
  const options: OAuthProviderOptions<OpenSeoOAuthEnv> = {
    apiRoute: MCP_ROUTE,
    apiHandler: mcpApiHandler,
    defaultHandler: createDefaultHandler(appFetch),
    authorizeEndpoint: OAUTH_AUTHORIZE_PATH,
    tokenEndpoint: OAUTH_TOKEN_PATH,
    clientRegistrationEndpoint: OAUTH_REGISTER_PATH,
    scopesSupported: [...MCP_OAUTH_SCOPES],
    refreshTokenTTL: REFRESH_TOKEN_TTL_SECONDS,
    resourceMetadata: {
      scopes_supported: [...MCP_OAUTH_SCOPES],
      resource_name: "OpenSEO MCP",
    },
    tokenExchangeCallback: ({ props, requestedScope }) => {
      const accessTokenProps = withWorkersOAuthMcpScopes(props, requestedScope);

      return accessTokenProps ? { accessTokenProps } : undefined;
    },
    onError: oauthErrorResponse,
  };

  return new OAuthProvider(options);
}
