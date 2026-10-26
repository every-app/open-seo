// The provider's refresh-token failures that only a new sign-in can fix: the
// grant sat idle past its 30-day window or was revoked. The bare provider text
// ("Grant not found") doesn't tell the agent or the user what to do next.
const DEAD_GRANT_REASONS = new Set([
  "grant_not_found",
  "refresh_token_mismatch",
]);
const REAUTHORIZE_DESCRIPTION =
  "Your OpenSEO sign-in has expired or was revoked. Reconnect OpenSEO in your agent and approve the sign-in again: https://openseo.so/docs/agent-setup";

export function handleOAuthError(error: {
  code: string;
  description: string;
  status: number;
  headers: Record<string, string>;
  internal: { category: string; reason: string };
}) {
  // 401s here are the standard OAuth discovery handshake, not failures: an
  // unauthenticated /mcp hit returns `invalid_token` (which triggers the
  // client's .well-known discovery), and stale client registrations draw
  // `invalid_client` until the client re-registers. Log those at debug so
  // they stop masquerading as errors; keep 5xx at error and everything else
  // (bad client metadata, etc.) at warn.
  const line = `[oauth] ${error.status} ${error.code}: ${error.description}`;
  if (error.status === 401) {
    console.debug(line);
  } else if (error.status >= 500) {
    console.error(line);
  } else {
    console.warn(line);
  }

  // Keep the invalid_grant code so clients still start a new authorization.
  if (
    error.internal.category === "refresh-token-grant" &&
    DEAD_GRANT_REASONS.has(error.internal.reason)
  ) {
    return Response.json(
      { error: error.code, error_description: REAUTHORIZE_DESCRIPTION },
      { status: error.status, headers: error.headers },
    );
  }

  // Returning void delegates the standards-compliant body, bearer challenge,
  // and CORS headers to workers-oauth-provider.
}
