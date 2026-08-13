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
    rateLimit: {
      enabled: true,
      timeWindow: 60 * 1000,
      maxRequests: 500,
    },
  });
}
