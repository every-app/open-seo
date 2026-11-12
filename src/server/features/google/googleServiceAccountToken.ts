import { z } from "zod";

/**
 * Google's OAuth 2.0 server-to-server flow for service accounts: sign a JWT
 * with the account's private key and trade it for a one-hour access token.
 * Uses Web Crypto so it runs the same on Workers and Node.
 *
 * The token endpoint is fixed. A key file's own `token_uri` is ignored, so an
 * uploaded file can't point the server at another host.
 */

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWT_LIFETIME_SECONDS = 3600;

const PEM_HEADER = "-----BEGIN PRIVATE KEY-----";
const PEM_FOOTER = "-----END PRIVATE KEY-----";

/** The fields of a downloaded service account key file we use. */
export const serviceAccountKeyFileSchema = z.object({
  type: z.literal("service_account"),
  client_email: z.string().email(),
  private_key: z.string().includes(PEM_HEADER).includes(PEM_FOOTER),
  private_key_id: z.string().optional(),
});

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().optional(),
});

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

/** Imports a PKCS#8 PEM private key for RS256 signing. Throws on a malformed key. */
export async function importServiceAccountKey(
  privateKeyPem: string,
): Promise<CryptoKey> {
  const body = privateKeyPem
    .replace(PEM_HEADER, "")
    .replace(PEM_FOOTER, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

/**
 * Mints an access token for the given scope. Returns null when Google refuses
 * the assertion (key deleted or disabled, account removed, clock skew).
 */
export async function fetchServiceAccountAccessToken(input: {
  clientEmail: string;
  privateKey: CryptoKey;
  scope: string;
}): Promise<{ accessToken: string; expiresInSeconds: number } | null> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const unsigned = `${base64UrlEncodeJson({ alg: "RS256", typ: "JWT" })}.${base64UrlEncodeJson(
    {
      iss: input.clientEmail,
      scope: input.scope,
      aud: GOOGLE_TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + JWT_LIFETIME_SECONDS,
    },
  )}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    input.privateKey,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;
  const parsed = tokenResponseSchema.safeParse(await response.json());
  if (!parsed.success) return null;
  return {
    accessToken: parsed.data.access_token,
    expiresInSeconds: parsed.data.expires_in ?? JWT_LIFETIME_SECONDS,
  };
}
