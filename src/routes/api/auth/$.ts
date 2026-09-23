import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { getAuth, hasHostedAuthConfig } from "@/lib/auth";
import { isHostedAuthMode } from "@/lib/auth-mode";
import { requireDgtlSeoAccess } from "@/server/auth/dgtl-access";

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

  const auth = getAuth();
  if (new URL(request.url).pathname.startsWith("/api/auth/organization/")) {
    const session = await auth.api.getSession({ headers: request.headers });
    if (session?.user) {
      try {
        await requireDgtlSeoAccess(session.user.id);
      } catch {
        return Response.json(
          { message: "DGTL SEO access unavailable or revoked" },
          { status: 403 },
        );
      }
    }
  }
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
