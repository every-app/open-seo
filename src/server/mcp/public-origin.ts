import { env } from "cloudflare:workers";
import { getAuthMode } from "@/lib/auth-mode";
import { hasOperatorSecret } from "@/server/standalone/operator-auth";

function firstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function getForwardedProtocol(request: Request) {
  const protocol = firstHeaderValue(request.headers.get("x-forwarded-proto"));
  return protocol === "http" || protocol === "https" ? protocol : null;
}

export function getPublicOrigin(request: Request) {
  // Behind the standalone Docker edition's Nginx the forwarded host is just
  // the client's Host header, so the configured origin is the trusted one
  // (auth.ts validates BETTER_AUTH_URL when the auth instance is built). The
  // edition's no-auth mode configures the same URL next to its operator
  // secret. The old Docker image forwards its whole .env, so a stray
  // BETTER_AUTH_URL there must not change the origin it has always derived
  // from the request.
  const mode = getAuthMode(env.AUTH_MODE);
  const configured = env.BETTER_AUTH_URL?.trim();
  if (
    mode === "password" ||
    (mode === "local_noauth" && configured && hasOperatorSecret())
  ) {
    return new URL(configured ?? "").origin;
  }

  const url = new URL(request.url);
  if (url.protocol === "https:") {
    return url.origin;
  }

  const protocol = getForwardedProtocol(request);
  const host = firstHeaderValue(request.headers.get("x-forwarded-host"));

  if (!protocol || !host) {
    return url.origin;
  }

  try {
    return new URL(`${protocol}://${host}`).origin;
  } catch {
    return url.origin;
  }
}

export function requestWithPublicOrigin(request: Request) {
  const url = new URL(request.url);
  const publicOrigin = getPublicOrigin(request);

  if (url.origin === publicOrigin) {
    return request;
  }

  // Concatenate rather than resolve the path against the origin: a path like
  // `//evil.example/mcp` would otherwise replace the host.
  return new Request(
    `${publicOrigin}${url.pathname}${url.search}${url.hash}`,
    request,
  );
}
