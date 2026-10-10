import { createBingClient, type BingSite } from "@/server/lib/bingClient";
import { BingAuthError } from "@/server/lib/bingErrors";
import {
  getBingAccessToken,
  hasBingGrant,
} from "@/server/features/bing/bingOAuth";

export type BingAccount = {
  // Null marks the connector's delegated OAuth grant, which has no row in
  // bing_credentials (Bing's token response carries no account identity).
  credentialId: string | null;
  // Null for the same reason; surfaces label it as an OAuth account.
  keyLast4: string | null;
  // The credential is unusable (revoked/expired): the user reconnects it.
  requiresReconnect: boolean;
  // Bing could not be reached to list this account's sites — a transient
  // fault, retryable, distinct from a bad credential.
  unavailable: boolean;
  sites: BingSite[];
};

/** Mint the connector's OAuth token, mapped onto the reconnect contract. */
export async function openOAuthToken(userId: string): Promise<string> {
  try {
    return await getBingAccessToken({ userId });
  } catch (error) {
    throw new BingAuthError("The Bing connection needs reconnecting.", error);
  }
}

/** The delegated OAuth account, if the user holds a grant. A dead grant
 *  reports `requiresReconnect` rather than throwing, so the picker can offer
 *  a reconnect instead of failing the whole list. */
export async function oauthAccountForUser(
  userId: string,
): Promise<BingAccount | null> {
  if (!(await hasBingGrant(userId))) return null;
  try {
    const client = createBingClient({
      accessToken: await openOAuthToken(userId),
    });
    return {
      credentialId: null,
      keyLast4: null,
      requiresReconnect: false,
      unavailable: false,
      sites: await client.listSites(),
    };
  } catch (error) {
    if (error instanceof BingAuthError) {
      return {
        credentialId: null,
        keyLast4: null,
        requiresReconnect: true,
        unavailable: false,
        sites: [],
      };
    }
    // A Bing outage or network fault must not fail the whole connection check
    // or the picker; surface it as retryable instead.
    console.error("bing.oauth.sites_failed", {
      cause: error instanceof Error ? error.message : String(error),
    });
    return {
      credentialId: null,
      keyLast4: null,
      requiresReconnect: false,
      unavailable: true,
      sites: [],
    };
  }
}
