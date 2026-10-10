import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { BING_API_KEY_MIN_LENGTH } from "@/shared/bing";
import { MIN_BETTER_AUTH_SECRET_LENGTH } from "@/shared/selfhost-checks";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { createBingClient } from "@/server/lib/bingClient";
import {
  BingApiError,
  BingAuthError,
  BingThrottleError,
} from "@/server/lib/bingErrors";
import {
  hasBingGrant,
  removeBingGrant,
} from "@/server/features/bing/bingOAuth";
import { BingConnectionRepository } from "@/server/features/bing/repositories/BingConnectionRepository";
import { BingCredentialRepository } from "@/server/features/bing/repositories/BingCredentialRepository";
import {
  oauthAccountForUser,
  type BingAccount,
} from "@/server/features/bing/services/bingOAuthAccount";

type BingCredentialSummary = { credentialId: string; keyLast4: string };

type BingAccountSummary = {
  credentialId: string;
  keyLast4: string;
  requiresReconnect: boolean;
  unavailable: boolean;
  verifiedSiteCount: number;
};

type BingSiteListResult = { accounts: BingAccount[] };

// Same key as the stored Google OAuth tokens and crawler credentials, so
// self-hosters have one secret to set and hosted mode always has it.
async function getEncryptionKey(): Promise<string> {
  const secret = (await getOptionalEnvValue("BETTER_AUTH_SECRET"))?.trim();
  if (!secret || secret.length < MIN_BETTER_AUTH_SECRET_LENGTH) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      `Set BETTER_AUTH_SECRET to at least ${MIN_BETTER_AUTH_SECRET_LENGTH} characters to store a Bing Webmaster API key. It encrypts the key.`,
    );
  }
  return secret;
}

/** Decrypts in memory only. A rotated secret leaves the key unreadable, which
 *  the user fixes by reconnecting; surface it as an auth failure, not a crash. */
export async function openApiKey(sealed: string): Promise<string> {
  try {
    const key = await getEncryptionKey();
    return await symmetricDecrypt({ key, data: sealed });
  } catch (error) {
    throw new BingAuthError(
      "The stored Bing Webmaster API key could not be read. Reconnect it.",
      error,
    );
  }
}

/** Whether this user holds any Bing credential at all — a stored key or a
 *  delegated OAuth grant. Drives the connect-vs-pick UI. A pure database read:
 *  it must not call Bing, or a Bing outage would break the connection check. */
async function hasAnyCredential(userId: string): Promise<boolean> {
  const [credentials, grant] = await Promise.all([
    BingCredentialRepository.listForUser(userId),
    hasBingGrant(userId),
  ]);
  return credentials.length > 0 || grant;
}

/** Every stored API key of this user, for the connect-vs-pick UI. */
async function listCredentialSummaries(
  userId: string,
): Promise<BingCredentialSummary[]> {
  const credentials = await BingCredentialRepository.listForUser(userId);
  return credentials.map((credential) => ({
    credentialId: credential.id,
    keyLast4: credential.keyLast4,
  }));
}

/** Stored API keys with verified-site counts, plus whether the user holds a
 *  delegated OAuth grant — for account-level management surfaces. The OAuth
 *  grant is reported as its own flag (managed as its own row), not as a key
 *  entry. */
async function listAccountsForUser(userId: string): Promise<{
  accounts: BingAccountSummary[];
  hasOAuthGrant: boolean;
  oauthRequiresReconnect: boolean;
  oauthUnavailable: boolean;
}> {
  const { accounts } = await listSitesForUser(userId);
  const oauthAccount = accounts.find(
    (account) => account.credentialId === null,
  );
  return {
    accounts: accounts.flatMap((account) =>
      account.credentialId !== null && account.keyLast4 !== null
        ? [
            {
              credentialId: account.credentialId,
              keyLast4: account.keyLast4,
              requiresReconnect: account.requiresReconnect,
              unavailable: account.unavailable,
              verifiedSiteCount: account.sites.filter((site) => site.isVerified)
                .length,
            },
          ]
        : [],
    ),
    hasOAuthGrant: oauthAccount !== undefined,
    oauthRequiresReconnect: oauthAccount?.requiresReconnect ?? false,
    oauthUnavailable: oauthAccount?.unavailable ?? false,
  };
}

/** Verify the key with `GetUserSites` before storing it, then add it as a new
 *  account. Re-adding an identical key is a no-op. */
async function saveCredential(input: {
  userId: string;
  apiKey: string;
}): Promise<BingCredentialSummary> {
  const apiKey = input.apiKey.trim();
  if (apiKey.length < BING_API_KEY_MIN_LENGTH) {
    throw new AppError(
      "VALIDATION_ERROR",
      "That doesn't look like a Bing Webmaster API key.",
    );
  }
  try {
    await createBingClient({ apiKey }).listSites();
  } catch (error) {
    if (error instanceof BingAuthError) {
      throw new AppError(
        "FORBIDDEN",
        "Bing rejected that API key. Check it in Bing Webmaster Tools → Settings → API Access.",
      );
    }
    if (error instanceof BingThrottleError) {
      console.error("bing.key_verify_throttled", {
        status: error.status,
        body: error.body?.slice(0, 200),
      });
      throw new AppError(
        "UPSTREAM_UNAVAILABLE",
        "Bing is throttling requests from this server's IP address, so the key can't be verified right now. This is common on shared cloud hosting; try again later.",
      );
    }
    if (error instanceof BingApiError) {
      // Status + a body snippet help "check server logs" actually work. The
      // key itself is never logged. A rejected key reaches here as
      // BingAuthError, so any status left is a genuine Bing fault.
      console.error("bing.key_verify_failed", {
        status: error.status,
        body: error.body?.slice(0, 300),
      });
      throw new AppError(
        "UPSTREAM_UNAVAILABLE",
        "Bing Webmaster API is temporarily unavailable. Please retry in a moment.",
      );
    }
    console.error("bing.key_verify_failed", {
      cause: error instanceof Error ? error.message : String(error),
    });
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "Bing Webmaster API is temporarily unavailable. Please retry in a moment.",
    );
  }
  // Dedupe: the same key must not become two accounts.
  const existing = await BingCredentialRepository.listForUser(input.userId);
  for (const credential of existing) {
    try {
      if ((await openApiKey(credential.apiKey)) === apiKey) {
        return {
          credentialId: credential.id,
          keyLast4: credential.keyLast4,
        };
      }
    } catch {
      // Unreadable (rotated secret) — ignore and continue.
    }
  }
  const key = await getEncryptionKey();
  const row = await BingCredentialRepository.insert({
    userId: input.userId,
    apiKey: await symmetricEncrypt({ key, data: apiKey }),
    keyLast4: apiKey.slice(-4),
  });
  return { credentialId: row.id, keyLast4: row.keyLast4 };
}

/** Remove one stored Bing account. Its project mappings cascade away. */
async function removeCredential(
  userId: string,
  credentialId: string,
): Promise<void> {
  await BingCredentialRepository.deleteById(userId, credentialId);
}

/** Remove the user's delegated OAuth grant. Any project mapping that ran on
 *  it is deleted too, mirroring the key cascade. */
async function removeOAuthCredential(userId: string): Promise<void> {
  await BingConnectionRepository.deleteOAuthMappingsForUser(userId);
  await removeBingGrant(userId);
}

/** Sites per credential for this user — the delegated OAuth account first,
 *  then every stored key. A rejected credential reports `requiresReconnect`
 *  rather than throwing. */
async function listSitesForUser(userId: string): Promise<BingSiteListResult> {
  const [oauthAccount, credentials] = await Promise.all([
    oauthAccountForUser(userId),
    BingCredentialRepository.listForUser(userId),
  ]);
  const accounts = await Promise.all(
    credentials.map(async (credential): Promise<BingAccount> => {
      try {
        const client = createBingClient({
          apiKey: await openApiKey(credential.apiKey),
        });
        return {
          credentialId: credential.id,
          keyLast4: credential.keyLast4,
          requiresReconnect: false,
          unavailable: false,
          sites: await client.listSites(),
        };
      } catch (error) {
        if (error instanceof BingAuthError) {
          return {
            credentialId: credential.id,
            keyLast4: credential.keyLast4,
            requiresReconnect: true,
            unavailable: false,
            sites: [],
          };
        }
        // One account's transient fault must not fail the whole picker.
        console.error("bing.key.sites_failed", {
          key_last4: credential.keyLast4,
          cause: error instanceof Error ? error.message : String(error),
        });
        return {
          credentialId: credential.id,
          keyLast4: credential.keyLast4,
          requiresReconnect: false,
          unavailable: true,
          sites: [],
        };
      }
    }),
  );
  return { accounts: oauthAccount ? [oauthAccount, ...accounts] : accounts };
}

export const BingCredentialService = {
  openApiKey,
  hasAnyCredential,
  listCredentialSummaries,
  listAccountsForUser,
  saveCredential,
  removeCredential,
  removeOAuthCredential,
  listSitesForUser,
};
