import { apiKey } from "@better-auth/api-key";

// Also the routing discriminator on /mcp: a credential starting with this
// prefix is treated as an API key, anything else flows to the OAuth provider.
export const API_KEY_PREFIX = "oseo_";

export function createApiKeyPlugin() {
  return apiKey({
    defaultPrefix: API_KEY_PREFIX,
    // Stored display prefix ("oseo_" + 4 key chars) shown in Settings so keys
    // are tellable apart; the plugin default of 6 barely clears the prefix.
    startingCharactersConfig: { shouldStore: true, charactersLength: 9 },
    // The plugin's own rate limit is off; the /mcp handler enforces a real
    // 5000-per-minute per-user limit via Cloudflare's rate-limit binding
    // instead (see server/mcp/api-key-auth.ts; hosted prod only). This
    // limiter is disabled because it is broken for steady traffic: its
    // window resets only after a full timeWindow of complete idle (it
    // compares against the previous request, not a window start), so
    // "500 / 60s" really meant "500 requests without a 60s pause". An active
    // MCP session never pauses that long, so keys hit the cap and were
    // hard-blocked for a minute at a time. It also never protected against
    // invalid keys — it ran only AFTER the hashed key matched a row.
    //
    // Raising maxRequests instead would not have worked: the limits are
    // snapshotted onto each apikey row at creation, whereas `enabled: false`
    // is read from this live config first — it frees existing keys too.
    rateLimit: { enabled: false },
  });
}
