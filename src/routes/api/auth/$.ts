import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getAuth, hasHostedAuthConfig } from "@/lib/auth";
import { isHostedAuthMode } from "@/lib/auth-mode";

async function handleAuthRequest(request: Request) {
  if (!isHostedAuthMode(env.AUTH_MODE)) {
    return new Response("Not found", {
      status: 404,
    });
  }

  if (!hasHostedAuthConfig()) {
    return new Response("Missing Better Auth hosted configuration", {
      status: 500,
    });
  }

  // Per-IP throttle on password sign-in so passwords can't be guessed at
  // machine speed. Better Auth's own limiter is in-memory, which on Workers
  // is per isolate, so it never engages. The binding is declared in
  // deploy/alchemy/alchemy.run.ts; the wrangler.jsonc surfaces (local dev,
  // Docker self-host) don't have it and skip limiting.
  const ip = request.headers.get("cf-connecting-ip");
  if (
    env.AUTH_RATE_LIMIT &&
    ip &&
    request.method === "POST" &&
    new URL(request.url).pathname === "/api/auth/sign-in/email"
  ) {
    const { success } = await env.AUTH_RATE_LIMIT.limit({ key: ip });
    if (!success) {
      return Response.json(
        { message: "Too many sign-in attempts. Try again in a minute." },
        { status: 429 },
      );
    }
  }

  const auth = getAuth();
  return auth.handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        return handleAuthRequest(request);
      },
      POST: async ({ request }: { request: Request }) => {
        return handleAuthRequest(request);
      },
    },
  },
});
