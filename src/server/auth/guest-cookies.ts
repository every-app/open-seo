import { z } from "zod";

// Guest-account cookies and request parsing, kept free of database imports so
// the sign-up hook and its tests can use them.

export const GUEST_CLAIM_COOKIE = "openseo_guest_claim";
// Long enough that someone who connects an agent and signs up a few weeks
// later still brings the guest's work along.
const GUEST_CLAIM_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
// Set at every real sign-in (auth.ts). A browser that has signed in before
// belongs to someone with an account, so it gets the sign-in page instead of
// an empty guest workspace when their session has lapsed.
export const RETURNING_BROWSER_COOKIE = "openseo_has_account";
const claimTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/**
 * Names the agent behind an MCP connection from where it sends the code back:
 * a web app's host (claude.ai, chatgpt.com), "localhost" for a CLI on the
 * person's computer, or a desktop app's URL scheme (cursor).
 */
export function agentFromRedirectUri(redirectUri: string | null) {
  const url = redirectUri ? URL.parse(redirectUri) : null;
  if (!url) return null;
  if (url.protocol === "http:" || url.protocol === "https:") {
    return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      ? "localhost"
      : url.hostname.slice(0, 100);
  }
  return url.protocol.slice(0, -1).slice(0, 100);
}

function parseClaimToken(value: unknown) {
  const parsed = claimTokenSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function readCookie(headers: Headers | undefined, cookieName: string) {
  const cookie = headers?.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === cookieName) return value.join("=");
  }
  return null;
}

export function readClaimCookie(headers: Headers | undefined) {
  return parseClaimToken(readCookie(headers, GUEST_CLAIM_COOKIE));
}

/**
 * Left by the connect page when it creates a guest, so the next sign-up or
 * sign-in in this browser claims the guest (claimGuestFromCookie). Only this
 * response sets it: a claim moves the agent's connection to the account, so a
 * claim must come from the browser that connected the agent.
 */
export function guestClaimCookie(claimToken: string) {
  return `${GUEST_CLAIM_COOKIE}=${claimToken}; Path=/; Max-Age=${GUEST_CLAIM_COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}
