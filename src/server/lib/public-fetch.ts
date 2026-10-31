import { getOptionalEnvValue } from "@/server/lib/runtime-env";

/**
 * Fetch a user-supplied URL. On Workers the `global_fetch_strictly_public`
 * compatibility flag already refuses private and reserved addresses, so this
 * is plain `fetch`. The standalone Docker edition has no such guarantee and
 * sets CRAWL_GATEWAY_URL instead: the request then goes through its
 * DNS-pinning gateway (scripts/celld/runtime/crawl-gateway.mjs), so a target
 * cannot rebind to an internal address between resolution and connect.
 * Callers follow redirects themselves, re-validating each hop and sending it
 * back through here, so the gateway request is always manual.
 */
export async function publicFetch(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const gateway = await getOptionalEnvValue("CRAWL_GATEWAY_URL");
  if (!gateway) return fetch(input, init);
  const secret = await getOptionalEnvValue("CRAWL_GATEWAY_SECRET");
  if (!secret) throw new Error("CRAWL_GATEWAY_SECRET is required");
  const headers = new Headers(init.headers);
  headers.set("x-crawl-url", new URL(input).href);
  headers.set("x-crawl-secret", secret);
  return fetch(gateway, { ...init, headers, redirect: "manual" });
}
