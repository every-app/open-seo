import { getAuth } from "@/lib/auth";
import { normalizeAuthRedirect } from "@/lib/auth-redirect";
import { BILLING_ROUTE } from "@/shared/billing";
import {
  claimGuestAccount,
  GUEST_CLAIM_COOKIE,
  parseClaimToken,
} from "@/server/auth/guest-accounts";

const CLAIM_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

function redirect(location: string, headers?: HeadersInit) {
  const response = new Response(null, { status: 302, headers });
  response.headers.set("Location", location);
  return response;
}

/**
 * The guest's "create your account" link. Someone already signed in takes
 * over the guest's organization at once. Anyone else gets a cookie naming the
 * guest and the sign-up page; the sign-in hook claims the guest once they sign
 * up or sign in (claimGuestFromCookie in auth.ts), even after email
 * verification sends them away and back.
 */
export async function handleGuestClaimRequest(request: Request) {
  const url = new URL(request.url);
  const claimToken = parseClaimToken(url.searchParams.get("token"));
  const next = normalizeAuthRedirect(
    url.searchParams.get("next") ?? BILLING_ROUTE,
  );
  if (!claimToken) return redirect("/sign-in");

  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (session) {
    const organizationId = await claimGuestAccount(claimToken, session.user.id);
    if (organizationId) {
      await auth.api.setActiveOrganization({
        headers: request.headers,
        body: { organizationId },
      });
    }
    return redirect(next);
  }

  return redirect(`/sign-up?${new URLSearchParams({ redirect: next })}`, {
    "Set-Cookie": `${GUEST_CLAIM_COOKIE}=${claimToken}; Path=/; Max-Age=${CLAIM_COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
  });
}
