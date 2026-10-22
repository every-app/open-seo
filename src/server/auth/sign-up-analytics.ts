import { waitUntil } from "cloudflare:workers";
import { getOAuthState } from "better-auth/api";
import { z } from "zod";
import { OAUTH_AUTHORIZE_PATH } from "@/lib/auth-redirect";
import { captureServerEvent } from "@/server/lib/posthog";

const emailSignUpBodySchema = z.object({ callbackURL: z.string() });

/**
 * `auth:sign_up_completed`, sent once the user row exists. Google sign-ups end
 * in a full-page redirect, so the browser never reports them as complete.
 * `entry` separates sign-ups an MCP client's OAuth consent started (the
 * authorize URL rides along as the sign-up redirect) from app sign-ups.
 */
export async function captureSignUpCompleted(
  user: { id: string; analyticsOptedOut?: unknown },
  ctx: { path?: string; body?: unknown } | null | undefined,
) {
  // Set from the visitor's privacy choices in the create hook. The new row
  // may not be visible yet to captureServerEvent's own opt-out read.
  if (user.analyticsOptedOut !== false) return;
  const method = ctx?.path === "/sign-up/email" ? "email" : "google";
  const target = signUpTarget(
    method === "email"
      ? emailSignUpBodySchema.safeParse(ctx?.body).data?.callbackURL
      : await getOAuthState().then(
          (state) => state?.newUserURL ?? state?.callbackURL,
          () => undefined,
        ),
  );
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

/** Where the new user goes after sign-up. */
function signUpTarget(callbackURL: string | undefined) {
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
