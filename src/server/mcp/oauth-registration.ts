import { z } from "zod";

const PUBLIC_CLIENT_AUTH_METHOD = "none";
const CONFIDENTIAL_CLIENT_AUTH_METHOD = "client_secret_post";
const PERPLEXITY_CALLBACK = "https://www.perplexity.ai/api/mcp/oauth/callback";
const MAX_CLIENT_REGISTRATION_BODY_BYTES = 1024 * 1024;

// Loose so every field the provider cares about survives the round trip.
const clientMetadataSchema = z.looseObject({
  token_endpoint_auth_method: z.string().optional(),
  redirect_uris: z.array(z.string()).optional(),
});

export async function normalizeClientRegistrationRequest(request: Request) {
  if (request.method !== "POST") {
    return request;
  }

  const contentLength = request.headers.get("Content-Length");
  if (
    contentLength &&
    Number.parseInt(contentLength, 10) > MAX_CLIENT_REGISTRATION_BODY_BYTES
  ) {
    // Keep Cloudflare's registration endpoint responsible for its own payload
    // limit errors; this shim only handles small, valid metadata requests.
    return request;
  }

  let rawMetadata: unknown;
  try {
    const text = await request.clone().text();
    if (text.length > MAX_CLIENT_REGISTRATION_BODY_BYTES) {
      // Match the provider's 1 MiB guard before parsing so the compatibility
      // shim cannot consume unusually large DCR payloads first.
      return request;
    }

    rawMetadata = JSON.parse(text);
  } catch {
    return request;
  }

  const parsed = clientMetadataSchema.safeParse(rawMetadata);
  if (!parsed.success || parsed.data.token_endpoint_auth_method !== undefined) {
    return request;
  }

  // Perplexity requires a client secret, so let the provider create and store a
  // real one. Other MCP clients that omit the method are public clients: some
  // discard DCR secrets and would otherwise fail their first token refresh.
  const isPerplexity = parsed.data.redirect_uris?.includes(PERPLEXITY_CALLBACK);
  const metadata = {
    ...parsed.data,
    token_endpoint_auth_method: isPerplexity
      ? CONFIDENTIAL_CLIENT_AUTH_METHOD
      : PUBLIC_CLIENT_AUTH_METHOD,
  };

  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  headers.delete("Content-Length");

  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(metadata),
  });
}
