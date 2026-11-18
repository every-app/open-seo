import {
  AuthorizationError,
  type AuthRequest,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { z } from "zod";
import { getAuth } from "@/lib/auth";
import {
  checkGuestEligibility,
  createGuestAccount,
  verifyGuestTurnstile,
} from "@/server/auth/guest-accounts";
import { guestClaimCookie } from "@/server/auth/guest-cookies";
import {
  buildAuthorizeRequestFromConsentQuery,
  completeMcpGrant,
  csrfProtected,
  getGrantedMcpScopes,
  getRelativeRequestTarget,
  jsonResponse,
  resolveContextForConsent,
} from "@/server/mcp/oauth-grant";

const guestRequestSchema = z.object({
  query: z.string(),
  turnstileToken: z.string().optional(),
});

/**
 * Creates a guest account for an MCP authorize request and approves it, so
 * someone connecting an agent never sees a sign-up form. Every check runs
 * again here: the redirect to /connect is only a hint. Anything that rules
 * the guest out sends the browser to the normal sign-in page instead.
 */
export async function handleOAuthGuestRequest(
  request: Request,
  oauth: OAuthHelpers,
) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!csrfProtected(request)) {
    return jsonResponse({ error: "Invalid request origin" }, { status: 403 });
  }
  const body = guestRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    return jsonResponse({ error: "Invalid request" }, { status: 400 });
  }

  const authorizeRequest = buildAuthorizeRequestFromConsentQuery(
    request,
    body.data.query,
  );
  let authRequest: AuthRequest;
  let scopes: string[];
  try {
    authRequest = await oauth.parseAuthRequest(authorizeRequest);
    scopes = getGrantedMcpScopes(authRequest.scope);
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return jsonResponse({ error: error.description }, { status: 400 });
    }
    if (error instanceof Error) {
      return jsonResponse({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const authorizeTarget = getRelativeRequestTarget(authorizeRequest);
  // Signed in after all (another tab): the authorize URL shows consent.
  if (await resolveContextForConsent(request)) {
    return jsonResponse({ redirectTo: authorizeTarget });
  }
  const signIn = {
    redirectTo: `/sign-in?${new URLSearchParams({ redirect: authorizeTarget })}`,
  };
  const eligibility = await checkGuestEligibility(
    request,
    authRequest.redirectUri,
  );
  if (!eligibility.eligible) {
    console.log(`mcp.guest refused: ${eligibility.reason}`);
    return jsonResponse(signIn);
  }
  if (!(await verifyGuestTurnstile(body.data.turnstileToken, request))) {
    console.log("mcp.guest refused: turnstile");
    return jsonResponse(signIn);
  }

  const guest = await createGuestAccount(request, eligibility, (organization) =>
    getAuth().api.createOrganization({ body: organization }),
  );
  if (!guest) {
    console.log("mcp.guest refused: ip_limit (concurrent)");
    return jsonResponse(signIn);
  }
  const redirectTo = await completeMcpGrant({
    request,
    oauth,
    authRequest,
    scopes,
    context: guest,
    guestClaimToken: guest.claimToken,
  });
  return jsonResponse(
    { redirectTo },
    { headers: { "Set-Cookie": guestClaimCookie(guest.claimToken) } },
  );
}
