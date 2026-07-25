import { z } from "zod";

/** Better Auth providerId for the Bing Webmaster Tools connection. Kept in
 *  `shared` so both server (auth config, Bing client) and client (connect
 *  button) can reference it without importing the server-only auth config. */
export const BING_OAUTH_PROVIDER_ID = "bing-webmaster";

/** Read-only for v1. `webmaster.manage` (URL submission) is a separate consent
 *  decision — see specs/0009. */
export const BING_OAUTH_SCOPES = ["webmaster.read"] as const;

// Bing publishes no OIDC discovery document, so these are hard-coded rather
// than resolved via `discoveryUrl`.
export const BING_AUTHORIZE_URL =
  "https://www.bing.com/webmasters/oauth/authorize";
export const BING_TOKEN_URL = "https://www.bing.com/webmasters/oauth/token";

/** `ssl.bing.com` and `www.bing.com` both serve the API identically (verified
 *  2026-07-25); the API reference uses this one. */
export const BING_API_BASE = "https://ssl.bing.com/webmaster/api.svc/json";

export const BING_SELF_HOSTED_SETUP_DOCS_URL =
  "https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_BING_WEBMASTER.md";

/** Claims carried by a Bing access token. Bing exposes no userinfo endpoint and
 *  issues no id_token, so this is the only source of account identity. Unknown
 *  claims are preserved — the wire shape is richer than what we consume. */
const bingAccessTokenClaimsSchema = z.looseObject({
  /** Stable per-account id. Also surfaced as `AuthenticationCode` on every site
   *  in GetUserSites. An identifier, not a secret — but it doubles as the site
   *  verification code, so never render it. */
  webmasteruid: z.string().min(1),
  webmasteremail: z.string().optional(),
  exp: z.number().optional(),
  /** Bing returns "Read" here, not the requested "webmaster.read". Never
   *  compare scope strings for equality. */
  scope: z.string().optional(),
});

export type BingAccessTokenClaims = z.infer<typeof bingAccessTokenClaimsSchema>;

function base64UrlToString(value: string): string {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`;
  const binary = atob(padded.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Decode a Bing access token to its claims, or null if it isn't the expected
 * shape. The token is base64url-encoded JSON rather than a signed JWT, so this
 * reads it directly; the JWT-style middle segment is also tried in case Bing
 * changes format. Callers get identity WITHOUT a network round-trip — this is
 * what backs the `genericOAuth` provider's `getUserInfo`.
 *
 * This does NOT verify a signature. The token is only ever read back from a
 * token response we requested over TLS or from our own encrypted storage, so
 * it is not attacker-controlled — but never trust these claims for
 * authorization decisions.
 */
export function decodeBingAccessToken(
  token: string,
): BingAccessTokenClaims | null {
  const segments = [token, token.split(".")[1] ?? ""];
  for (const segment of segments) {
    if (!segment) continue;
    try {
      const parsed = bingAccessTokenClaimsSchema.safeParse(
        JSON.parse(base64UrlToString(segment)),
      );
      if (parsed.success) return parsed.data;
    } catch {
      continue;
    }
  }
  return null;
}
