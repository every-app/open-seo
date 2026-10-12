import { z } from "zod";
import { SHOPIFY_SIGNATURE_AGENT } from "@/shared/crawler-access";

/**
 * Checks a Shopify crawler-access signature against the domain it will be
 * sent to, before it is saved.
 *
 * Shopify signs two things with the key it publishes: the domain picked in
 * Shopify admin (`@authority`) and the `Signature-Agent` value. Shopify
 * ignores a signature made for another domain (`www.` versus the bare domain
 * is the usual slip) or pasted incompletely, and rate-limits the crawl as if
 * it were unsigned. Checking here tells the merchant why at save time.
 */

const SHOPIFY_KEY_DIRECTORY_URL =
  "https://shopify.com/.well-known/http-message-signatures-directory";

export type ShopifySignatureProblem =
  | { reason: "wrong_domain"; host: string; signedHost: string }
  | { reason: "invalid"; host: string };

const directoryKeySchema = z.object({ kid: z.string(), x: z.string() });

/**
 * Null means the signature is fine for `host`, or couldn't be checked: an
 * unreachable key directory must not block a save.
 */
export async function checkShopifySignature(input: {
  host: string;
  signatureInput: string;
  signature: string;
}): Promise<ShopifySignatureProblem | null> {
  const { host, signatureInput } = input;
  const params = /^\w+=(\(.+)$/.exec(signatureInput)?.[1];
  const keyId = /;keyid="([^"]+)"/.exec(signatureInput)?.[1];
  const signatureBytes = decodeSignature(input.signature);
  if (!params || !keyId || !signatureBytes) return { reason: "invalid", host };

  const key = await importShopifyKey(keyId);
  if (!key) return null;

  // RFC 9421 signature base over what Shopify signs, ending with the
  // signature parameters exactly as they appear after the label.
  const verifiesFor = (domain: string) =>
    crypto.subtle.verify(
      "Ed25519",
      key,
      signatureBytes,
      new TextEncoder().encode(
        `"@authority": ${domain}\n"signature-agent": ${SHOPIFY_SIGNATURE_AGENT}\n"@signature-params": ${params}`,
      ),
    );

  if (await verifiesFor(host)) return null;
  const twinHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  if (await verifiesFor(twinHost)) {
    return { reason: "wrong_domain", host, signedHost: twinHost };
  }
  return { reason: "invalid", host };
}

/** The bytes of a `sig1=:<base64>:` value, or null if it isn't one. */
function decodeSignature(signature: string): Uint8Array<ArrayBuffer> | null {
  const base64 = /^\w+=:([A-Za-z0-9+/]+={0,2}):$/.exec(signature)?.[1];
  if (!base64) return null;
  try {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    // Ed25519 signatures are 64 bytes, and the Workers runtime throws on any
    // other length instead of failing the verify.
    return bytes.length === 64 ? bytes : null;
  } catch {
    return null;
  }
}

async function importShopifyKey(keyId: string): Promise<CryptoKey | null> {
  try {
    const response = await fetch(SHOPIFY_KEY_DIRECTORY_URL, {
      signal: AbortSignal.timeout(5_000),
    });
    const { kid, x } = directoryKeySchema.parse(await response.json());
    // A signature made with a key Shopify has since rotated out may still be
    // valid, so it is left unchecked rather than rejected.
    if (kid !== keyId) return null;
    return await crypto.subtle.importKey(
      "jwk",
      { kty: "OKP", crv: "Ed25519", x },
      "Ed25519",
      false,
      ["verify"],
    );
  } catch (error) {
    console.warn("Skipped the Shopify signature check:", error);
    return null;
  }
}
