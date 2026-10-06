import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getAuth } from "@/lib/auth";
import { getMissingHostedAuthConfigVariable } from "@/lib/auth-hosted-config";
import { isHostedAuthMode } from "@/lib/auth-mode";

async function handleAuthRequest(request: Request) {
  if (!isHostedAuthMode(env.AUTH_MODE)) {
    return new Response("Not found", {
      status: 404,
    });
  }

  const missingConfig = getMissingHostedAuthConfigVariable(env);
  if (missingConfig) {
    return new Response(
      `Missing Better Auth hosted configuration: ${missingConfig}`,
      {
        status: 500,
      },
    );
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
