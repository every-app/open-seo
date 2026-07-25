import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { getAuth } from "@/lib/auth";

// The Bing API key (self-hosted mode: Bing rejects localhost redirect URIs,
// so self-hosters cannot complete the OAuth flow) never expires and has no
// refresh flow, so it is NOT stored in Better Auth's account table — the
// table's refresh machinery does not apply. It lives in a column another lane
// owns; these helpers stay pure and storage-agnostic.
//
// Unlike gsc/selfHostedOAuth.ts — which must mirror Better Auth's
// `account.encryptOAuthTokens` gate so its writes stay in sync with Better
// Auth's read path — we own BOTH the write and read paths here, so the key is
// ALWAYS encrypted at rest with the same key material (derived from
// BETTER_AUTH_SECRET via the auth context). The round-trip therefore works
// whether or not `encryptOAuthTokens` is enabled.
async function getEncryptionKey() {
  const ctx = await getAuth().$context;
  return ctx.secretConfig;
}

export async function encryptBingApiKey(plaintext: string): Promise<string> {
  return symmetricEncrypt({ key: await getEncryptionKey(), data: plaintext });
}

export async function decryptBingApiKey(ciphertext: string): Promise<string> {
  return symmetricDecrypt({ key: await getEncryptionKey(), data: ciphertext });
}
