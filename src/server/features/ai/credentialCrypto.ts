import { symmetricEncrypt, symmetricDecrypt } from "better-auth/crypto";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

// Encrypted-at-rest storage for UI-entered AI provider credentials (Phase S).
//
// - Cipher: better-auth's symmetricEncrypt (AES-GCM, random IV, versioned
//   envelope) — the same primitive the self-hosted GSC OAuth flow uses for
//   token encryption, already audited as a dependency.
// - Key: deployment env only, never stored in D1/PG, never returned to
//   clients, never logged. `AI_CREDENTIALS_ENCRYPTION_KEY` wins when set;
//   otherwise `BETTER_AUTH_SECRET` is used. Either way the key is
//   domain-separated (`:ai-credentials-v1`) so AI credential ciphertext can
//   never be cross-decrypted as an OAuth token (or vice versa).
// - Payload: one JSON map per settings row, `{ [providerId]: apiKey }`, so a
//   scope can hold credentials for several providers at once while resolution
//   stays provider-aware.
// - Failure posture: unreadable ciphertext (wrong/rotated key, corruption)
//   decrypts to null — the UI reports "credential storage unavailable or
//   unreadable; re-enter the key" instead of crashing or leaking.

const KEY_DOMAIN = ":ai-credentials-v1";

export type CredentialMap = Record<string, string>;

/** Deployment encryption key, domain-separated. Null when not configured. */
export async function resolveCredentialEncryptionKey(): Promise<string | null> {
  const explicit = await getOptionalEnvValue("AI_CREDENTIALS_ENCRYPTION_KEY");
  if (explicit) return `${explicit}${KEY_DOMAIN}`;
  const betterAuthSecret = await getOptionalEnvValue("BETTER_AUTH_SECRET");
  if (betterAuthSecret) return `${betterAuthSecret}${KEY_DOMAIN}`;
  return null;
}

/** Encrypt a provider→key map. Returns null when no deployment key is set. */
export async function encryptCredentialMap(
  map: CredentialMap,
): Promise<string | null> {
  const key = await resolveCredentialEncryptionKey();
  if (!key) return null;
  return symmetricEncrypt({ key, data: JSON.stringify(map) });
}

/**
 * Decrypt a stored map. Returns null when storage is unkeyed, the ciphertext
 * is unreadable (wrong/rotated key), or the plaintext is not the expected
 * shape — callers treat null as "no stored credentials; re-enter".
 */
export async function decryptCredentialMap(
  ciphertext: string | null | undefined,
): Promise<CredentialMap | null> {
  if (!ciphertext) return null;
  const key = await resolveCredentialEncryptionKey();
  if (!key) return null;
  try {
    const plaintext = await symmetricDecrypt({ key, data: ciphertext });
    const parsed: unknown = JSON.parse(plaintext);
    if (typeof parsed !== "object" || parsed === null) return null;
    const map: CredentialMap = {};
    for (const [provider, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.length > 0) {
        map[provider] = value;
      }
    }
    return map;
  } catch {
    // Wrong key / corrupted envelope: fail safe, never throw to callers.
    return null;
  }
}
