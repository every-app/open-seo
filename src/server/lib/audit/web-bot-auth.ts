/**
 * Web Bot Auth signing for the site audit crawler.
 *
 * Site owners behind Cloudflare (and other gatekeepers) can verify that a
 * request really came from OpenSEO instead of trusting the spoofable
 * User-Agent. Every crawler request carries an RFC 9421 signature made with our
 * Ed25519 key, and the public half is served from the key directory on the app
 * origin. Unset WEB_BOT_AUTH_JWK (self-hosting) sends unsigned requests.
 */
import { component, createSignature } from "http-message-sig";
import { sign, type WebBotSigner } from "web-bot-auth";
import { signerFromJWK } from "web-bot-auth/crypto";
import { z } from "zod";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { crawlerHeadersFor, type CrawlerAccess } from "@/shared/crawler-access";

export const CRAWL_USER_AGENT = "OpenSEO-Audit/1.0";

/** Where verifiers fetch our public key: `<origin>/.well-known/http-message-signatures-directory`. */
const SIGNATURE_AGENT_ORIGIN = "https://app.openseo.so";

const SIGNATURE_LIFETIME_MS = 60_000;

const ed25519PrivateJwk = z.object({
  kty: z.literal("OKP"),
  crv: z.literal("Ed25519"),
  x: z.string(),
  d: z.string(),
});

interface SigningKey {
  signer: WebBotSigner;
  publicJwk: { kty: "OKP"; crv: "Ed25519"; x: string };
}

let signingKeyPromise: Promise<SigningKey | null> | undefined;

/** Null when signing is off. A bad key must not take audits down: crawl unsigned. */
function getSigningKey(): Promise<SigningKey | null> {
  signingKeyPromise ??= loadSigningKey().catch(() => {
    // Not the error itself: a JSON.parse message quotes the text around the
    // bad token, which could be part of the private key.
    console.error("WEB_BOT_AUTH_JWK is unusable; crawling unsigned");
    return null;
  });
  return signingKeyPromise;
}

async function loadSigningKey(): Promise<SigningKey | null> {
  const jwkText = await getOptionalEnvValue("WEB_BOT_AUTH_JWK");
  if (!jwkText) return null;
  const jwk = ed25519PrivateJwk.parse(JSON.parse(jwkText));
  return {
    signer: await signerFromJWK(jwk),
    publicJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x },
  };
}

/**
 * Headers for one crawler request to `url`. Shopify crawler access already
 * carries its own `Signature*` headers for that store, so ours are only added
 * when no crawler-access credential applies.
 */
export async function auditRequestHeaders(
  url: string,
  access: CrawlerAccess | null | undefined,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "User-Agent": CRAWL_USER_AGENT };
  const accessHeaders = crawlerHeadersFor(url, access);
  if (Object.keys(accessHeaders).length > 0) {
    return { ...headers, ...accessHeaders };
  }

  const key = await getSigningKey();
  if (!key) return headers;

  // Structured-string form: the one Cloudflare verifies today.
  headers["Signature-Agent"] = `"${SIGNATURE_AGENT_ORIGIN}"`;
  const now = new Date();
  // Covers @authority and Signature-Agent only, so the method is irrelevant.
  const fields = await sign(
    {
      kind: "request",
      method: "GET",
      targetUri: url,
      fields: Object.entries(headers).map(([name, value]) => ({ name, value })),
    },
    {
      signer: key.signer,
      created: now,
      expires: new Date(now.getTime() + SIGNATURE_LIFETIME_MS),
    },
  );
  headers.Signature = fields.signature;
  headers["Signature-Input"] = fields.signatureInput;
  return headers;
}

/** The signed public key directory verifiers fetch, or 404 when signing is off. */
export async function webBotAuthDirectoryResponse(
  request: Request,
): Promise<Response> {
  const key = await getSigningKey();
  if (!key) return new Response("Not found", { status: 404 });

  const { signer } = key;
  const headers = new Headers({
    "content-type": "application/http-message-signatures-directory+json",
    "cache-control": "public, max-age=300",
  });
  const created = Math.floor(Date.now() / 1000);
  const fields = await createSignature(
    {
      kind: "response",
      status: 200,
      fields: [],
      request,
    },
    {
      label: "binding0",
      signer,
      components: [component("@authority", { req: true })],
      parameters: {
        created,
        expires: created + 3600,
        keyid: signer.keyid,
        alg: signer.algorithm,
        tag: "http-message-signatures-directory",
      },
    },
  );
  headers.set("Signature", fields.signature);
  headers.set("Signature-Input", fields.signatureInput);
  return new Response(JSON.stringify({ keys: [key.publicJwk] }), {
    headers,
  });
}
