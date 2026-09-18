// Shared vocabulary for public share links: the mint, and the path the two
// routes and the app all build. The server-only halves (the kill switch, the
// token shape check) live in @/server/features/reports/shareAccess.

/**
 * 24 random bytes rendered base64url: 192 bits of entropy in exactly 32
 * characters, with no padding and nothing to percent-encode in a path segment.
 * The token IS the capability — there is no second factor on `/s/<token>` — so
 * it comes from `crypto.getRandomValues`, never `Math.random` or a uuid.
 */
export function mintShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

/** The public path for a token. One definition, used by both routes and the app. */
export const sharePath = (token: string) => `/s/${token}`;
