import { symmetricEncrypt, symmetricDecrypt } from "better-auth/crypto";
import { z } from "zod";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

// Encrypted-at-rest storage for DataForSEO provider credentials.
//
// - Cipher: better-auth's symmetricEncrypt (AES-GCM, random IV, versioned
//   envelope) — audited dependency matching AI credentials & GSC OAuth tokens.
// - Key: deployment env only, never stored in D1/PG, never returned to
//   clients, never logged. `AI_CREDENTIALS_ENCRYPTION_KEY` wins when set;
//   otherwise `BETTER_AUTH_SECRET` is used. Domain-separated
//   (`:dataforseo-credentials-v1`) so DataForSEO ciphertext can never be
//   cross-decrypted as an AI provider key or OAuth token.
// - Payload: JSON `{ login: string, password: string }`.
// - Failure posture: unreadable ciphertext (wrong/rotated key, corruption)
//   decrypts to null — UI/service reports "credentials unreadable; re-enter"
//   instead of crashing or leaking.

const KEY_DOMAIN = ":dataforseo-credentials-v1";

export type DataforseoCredentials = {
  login: string;
  password: string;
};

/** Deployment encryption key, domain-separated. Null when not configured. */
export async function resolveDataforseoEncryptionKey(): Promise<string | null> {
  const explicit = await getOptionalEnvValue("AI_CREDENTIALS_ENCRYPTION_KEY");
  if (explicit) return `${explicit}${KEY_DOMAIN}`;
  const betterAuthSecret = await getOptionalEnvValue("BETTER_AUTH_SECRET");
  if (betterAuthSecret) return `${betterAuthSecret}${KEY_DOMAIN}`;
  return null;
}

/**
 * Encrypt a DataForSEO { login, password } credential pair.
 * Returns null when no deployment key is set.
 */
export async function encryptDataforseoCredentials(
  creds: DataforseoCredentials,
): Promise<string | null> {
  const key = await resolveDataforseoEncryptionKey();
  if (!key) return null;
  return symmetricEncrypt({ key, data: JSON.stringify(creds) });
}

/**
 * Decrypt stored DataForSEO credentials. Returns null when storage is unkeyed,
 * the ciphertext is unreadable (wrong/rotated key), or the plaintext is not
 * the expected shape.
 */
const credentialsSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

export async function decryptDataforseoCredentials(
  ciphertext: string | null | undefined,
): Promise<DataforseoCredentials | null> {
  if (!ciphertext) return null;
  const key = await resolveDataforseoEncryptionKey();
  if (!key) return null;
  try {
    const plaintext = await symmetricDecrypt({ key, data: ciphertext });
    const parsed: unknown = JSON.parse(plaintext);
    const parsedCreds = credentialsSchema.safeParse(parsed);
    if (!parsedCreds.success) return null;
    return parsedCreds.data;
  } catch {
    // Corrupted envelope / wrong key: fail safe, never throw to callers.
    return null;
  }
}

/**
 * Normalizes DataForSEO API Login for safe UI display (e.g. "********4f2a").
 * Never reveals full login or password.
 */
export function maskDataforseoLogin(
  login: string | null | undefined,
): string | null {
  if (!login || typeof login !== "string") return null;
  const trimmed = login.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= 4) return "********";
  return `********${trimmed.slice(-4)}`;
}

/**
 * Normalizes legacy `DATAFORSEO_API_KEY` into canonical { login, password }.
 * In OpenSEO, `DATAFORSEO_API_KEY` is base64-encoded "login:password".
 */
export function parseLegacyDataforseoApiKey(
  apiKey: string | null | undefined,
): DataforseoCredentials | null {
  if (!apiKey || typeof apiKey !== "string") return null;
  const trimmed = apiKey.trim();
  if (!trimmed) return null;

  try {
    const decoded = Buffer.from(trimmed, "base64").toString("utf-8");
    const colonIdx = decoded.indexOf(":");
    if (colonIdx > 0 && colonIdx < decoded.length - 1) {
      const login = decoded.slice(0, colonIdx).trim();
      const password = decoded.slice(colonIdx + 1).trim();
      if (login && password) {
        return { login, password };
      }
    }
  } catch {
    // If not valid base64 or colon missing, cannot parse
  }
  return null;
}
