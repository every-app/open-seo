import { usesBetterAuthServer } from "@/server/lib/runtime-env";

// The two server-side gates every share path runs: is sharing on at all, and
// does this path segment even look like a token. Server-only, so reading the
// env here cannot drag `cloudflare:workers` into the client bundle — the
// client half of sharing is `sharePath` in @/shared/report-share.

/**
 * Sharing needs a deployment with its own accounts (hosted and password modes): a
 * public origin and a sign-in page. The other self-hosted modes are behind
 * Cloudflare Access or have no auth at all, and neither can serve a link to a
 * reader who is not signed in. One predicate, so the mint, the share page and
 * the raw endpoint cannot disagree.
 */
export function sharesEnabled(): Promise<boolean> {
  return usesBetterAuthServer();
}

/**
 * The shape check both public entry points run before touching the database, so
 * a scanner walking `/s/<anything>` is answered without a query. Matches what
 * mintShareToken emits: 32 base64url characters.
 */
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;
