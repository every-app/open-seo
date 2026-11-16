import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getAuth, hasBetterAuthConfig } from "@/lib/auth";
import { usesBetterAuth } from "@/lib/auth-mode";
import { throttleAuthRequest } from "@/server/auth/auth-rate-limit";

async function handleAuthRequest(request: Request) {
  if (!usesBetterAuth(env.AUTH_MODE)) {
    return new Response("Not found", {
      status: 404,
    });
  }

  if (!hasBetterAuthConfig()) {
    return new Response("Missing Better Auth configuration", {
      status: 500,
    });
  }

  const throttled = await throttleAuthRequest(request, env.AUTH_RATE_LIMIT);
  if (throttled) return throttled;

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
