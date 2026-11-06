import { waitUntil } from "cloudflare:workers";
import { getOAuthState } from "better-auth/api";
import { z } from "zod";
import { OAUTH_AUTHORIZE_PATH } from "@/lib/auth-redirect";
import {
  agentFromRedirectUri,
  readClaimCookie,
} from "@/server/auth/guest-cookies";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { GuestAccountRepository } from "@/server/auth/repositories/GuestAccountRepository";
import { captureServerEvent } from "@/server/lib/posthog";

const emailSignUpBodySchema = z.object({ callbackURL: z.string() });

type SignUpContext =
  | {
      path?: string;
      body?: unknown;
      headers?: Headers;
      request?: Request;
    }
  | null
  | undefined;

/**
 * `auth:sign_up_completed`, sent once the user row exists. Google sign-ups end
 * in a full-page redirect, so the browser never reports them as complete.
 * `entry` separates sign-ups an MCP client's OAuth consent started (the
 * authorize URL rides along as the sign-up redirect) from app sign-ups.
 */
export async function captureSignUpCompleted(
  user: { id: string; analyticsOptedOut?: unknown },
  ctx: SignUpContext,
) {
  // Set from the visitor's privacy choices in the create hook. The new row
  // may not be visible yet to captureServerEvent's own opt-out read.
  if (user.analyticsOptedOut !== false) return;
  const method = signUpMethod(ctx);
  const target = await signUpTarget(ctx);
  waitUntil(
    captureServerEvent({
      distinctId: user.id,
      event: "auth:sign_up_completed",
      organizationId: null,
      properties: {
        method,
        entry: target?.pathname === OAUTH_AUTHORIZE_PATH ? "mcp" : "app",
        // Signed up from the marketing site's free keyword check.
        from_free_check:
          target?.pathname === "/onboarding" &&
          target.searchParams.has("domain"),
      },
    }),
  );
}

/**
 * Saves where a hosted signup came from. `entry` is "mcp" when an AI agent's
 * connection drove it: they're claiming a guest account an agent made, or the
 * agent's connect window sent them to sign up (the authorize URL rides along
 * as the sign-up redirect). Otherwise "app". The sign-up page carries the landing page's UTM tags into
 * the post-signup redirect, so they survive the Google round trip and email
 * verification without a cookie.
 */
export async function saveSignUpSource(userId: string, ctx: SignUpContext) {
  const target = await signUpTarget(ctx);
  const claimToken = readClaimCookie(ctx?.headers ?? ctx?.request?.headers);
  const guest = claimToken
    ? await GuestAccountRepository.findUnclaimedGuest(claimToken)
    : null;
  const fromAgent = target?.pathname === OAUTH_AUTHORIZE_PATH;
  // Untrusted URL input: cap what lands in the row.
  const tag = (name: string) =>
    target?.searchParams.get(name)?.slice(0, 200) || null;
  await AuthRepository.saveSignupCampaign(userId, {
    entry: guest || fromAgent ? "mcp" : "app",
    wasGuest: Boolean(guest),
    agent: guest
      ? guest.agent
      : fromAgent
        ? agentFromRedirectUri(target.searchParams.get("redirect_uri"))
        : null,
    utmMedium: tag("utm_medium"),
    utmSource: tag("utm_source"),
    utmCampaign: tag("utm_campaign"),
    utmContent: tag("utm_content"),
  });
}

function signUpMethod(ctx: SignUpContext) {
  return ctx?.path === "/sign-up/email" ? "email" : "google";
}

/** Where the new user goes after sign-up. */
async function signUpTarget(ctx: SignUpContext) {
  const callbackURL =
    signUpMethod(ctx) === "email"
      ? emailSignUpBodySchema.safeParse(ctx?.body).data?.callbackURL
      : await getOAuthState().then(
          (state) => state?.newUserURL ?? state?.callbackURL,
          () => undefined,
        );
  if (!callbackURL) return null;
  try {
    const url = new URL(callbackURL, "https://openseo.local");
    // Email sign-ups verify first, and carry the destination as `redirect`.
    const redirect =
      url.pathname === "/verify-email"
        ? url.searchParams.get("redirect")
        : null;
    return redirect ? new URL(redirect, url) : url;
  } catch {
    return null;
  }
}
