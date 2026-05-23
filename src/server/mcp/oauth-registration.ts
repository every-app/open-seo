const CONFIDENTIAL_CLIENT_AUTH_METHOD = "client_secret_post";
const MAX_CLIENT_REGISTRATION_BODY_BYTES = 1024 * 1024;

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

  let clientMetadata: unknown;
  try {
    const text = await request.clone().text();
    if (text.length > MAX_CLIENT_REGISTRATION_BODY_BYTES) {
      // Match the provider's 1 MiB guard before parsing so the compatibility
      // shim cannot consume unusually large DCR payloads first.
      return request;
    }

    clientMetadata = JSON.parse(text);
  } catch {
    return request;
  }

  if (!clientMetadata || typeof clientMetadata !== "object") {
    return request;
  }

  const metadata = {
    ...clientMetadata,
  } as Record<string, unknown>;

  if (
    metadata.token_endpoint_auth_method === undefined ||
    metadata.token_endpoint_auth_method === "none"
  ) {
    // Perplexity registers as a public client but then rejects DCR responses
    // without a client_secret. Use client_secret_post because its validator
    // accepts that method but rejects client_secret_basic.
    metadata.token_endpoint_auth_method = CONFIDENTIAL_CLIENT_AUTH_METHOD;
  }

  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  headers.delete("Content-Length");

  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(metadata),
  });
}
