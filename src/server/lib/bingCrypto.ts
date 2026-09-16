import { getRequiredEnvValue } from "@/server/lib/runtime-env";

// Bing API keys are the only per-user third-party credential this app stores
// directly (GSC/GA4 tokens are OAuth grants Better Auth encrypts itself).
// There's no existing symmetric-crypto helper to reuse, so this derives an
// AES-256-GCM key from BETTER_AUTH_SECRET via SHA-256 and uses Web Crypto
// (`crypto.subtle`), which — unlike Node's `crypto` module — is available on
// Cloudflare Workers.
let cachedKey: Promise<CryptoKey> | null = null;

async function getAesKey(): Promise<CryptoKey> {
  if (!cachedKey) {
    cachedKey = (async () => {
      const secret = await getRequiredEnvValue("BETTER_AUTH_SECRET");
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(secret),
      );
      return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
        "encrypt",
        "decrypt",
      ]);
    })();
  }
  return cachedKey;
}

/** Encrypts `plaintext` to a single base64 string: 12-byte random IV followed
 *  by the AES-GCM ciphertext (auth tag included). */
export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToBase64(combined);
}

export async function decryptSecret(encoded: string): Promise<string> {
  const key = await getAesKey();
  const combined = base64ToBytes(encoded);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
