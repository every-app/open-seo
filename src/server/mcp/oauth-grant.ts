import { waitUntil } from "cloudflare:workers";
import type {
  AuthRequest,
  OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { getHostedBaseUrl } from "@/lib/auth";
import { OAUTH_AUTHORIZE_PATH } from "@/lib/auth-redirect";
import { MCP_OAUTH_SCOPES, MCP_SCOPE } from "@/lib/oauth-resource";
import { asAppError } from "@/server/lib/errors";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { resolveHostedContext } from "@/middleware/ensure-user/hosted";
import {
  completeOnboardingFromAgent,
  markMcpConnected,
  recordMcpAuthorized,
} from "@/server/features/activation/mcpActivation";
import { getWebChat } from "@/server/mcp/web-chat";
import { captureServerEvent } from "@/server/lib/posthog";
import { captureMetaSetupStep, MetaSetupEvent } from "@/server/referrals/meta";
import { createWorkersOAuthMcpProps } from "@/server/mcp/context";

/**
 * Issues the MCP grant for an approved authorize request and returns the
 * client redirect. Shared by the consent screen and guest accounts.
 */
export async function completeMcpGrant(input: {
  request: Request;
  oauth: OAuthHelpers;
  authRequest: AuthRequest;
  scopes: string[];
  context: { userId: string; userEmail: string; organizationId: string };
  guestClaimToken?: string;
}) {
  const { request, oauth, authRequest, scopes, context } = input;
  // The grant is bound to the organization active at consent: every /mcp
  // request re-checks the user's membership in exactly this org and 401s once
  // it is gone (transport.ts). The same id goes into the grant metadata below,
  // which the Settings "Connected agents" list reads to name the workspace.
  const props = createWorkersOAuthMcpProps({
    userId: context.userId,
    userEmail: context.userEmail,
    organizationId: context.organizationId,
    baseUrl: getHostedBaseUrl(),
    clientId: authRequest.clientId,
    scopes,
    guestClaimToken: input.guestClaimToken,
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
  await captureMetaSetupStep(
    MetaSetupEvent.AgentConnected,
    context.organizationId,
    request,
  );
  // Connecting an agent is the last onboarding step, so this finishes
  // onboarding for people who paste the setup prompt and never return to the
  // wizard.
  await completeOnboardingFromAgent(context, "agent_connect");
  await markMcpConnected(
    context,
    getWebChat([authRequest.redirectUri]) ?? undefined,
  );

  waitUntil(
    captureServerEvent({
      distinctId: context.userId,
      event: "mcp:authorize_success",
      organizationId: context.organizationId,
      properties: {
        client_id: authRequest.clientId,
        scopes: scopes.join(" "),
        guest: Boolean(input.guestClaimToken),
      },
    }),
  );

  return redirectTo;
}

// Request helpers shared by the consent and guest handlers.

export const OAUTH_AUTHORIZATION_PARAM_NAMES = [
  "response_type",
  "client_id",
  "redirect_uri",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
  "resource",
] as const;

export function getRelativeRequestTarget(request: Request) {
  const url = new URL(request.url);
  return `${url.pathname}${url.search}`;
}

export function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");

  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export function csrfProtected(request: Request) {
  const origin = request.headers.get("Origin");
  return origin === getPublicOrigin(request);
}

export async function resolveContextForConsent(request: Request) {
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

export function buildAuthorizeRequestFromConsentQuery(
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

export function getGrantedMcpScopes(requestedScopes: string[]) {
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
